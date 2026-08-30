import type { Conversation, Message } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { decrypt, encrypt } from '../lib/crypto.js';
import { notFound, badRequest } from '../lib/errors.js';
import { generate, type ChatTurn } from '../engine/inference.js';
import type { PersonaContext } from '../engine/persona.js';
import { IDENTITY } from '../engine/persona.js';
import {
  EXTRACTION_PROMPT,
  memoriesForPrompt,
  parseExtraction,
  saveExtracted,
} from './memory.service.js';
import { knowledgeForPrompt } from './knowledge.service.js';
import { needsSearch, searchContext, type SearchResult } from './search.service.js';
import { logger } from '../lib/logger.js';
import { env } from '../lib/env.js';

/** أقصى عدد رسائل سابقة نرسلها للمحرك — نحمي نافذة السياق. */
const HISTORY_LIMIT = 20;

export interface PlainMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: Date;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

/** يفك تشفير رسالة للعرض. */
function toPlain(message: Message): PlainMessage {
  return {
    id: message.id,
    role: message.role,
    content: decrypt(message.content),
    createdAt: message.createdAt,
    model: message.model,
    inputTokens: message.inputTokens,
    outputTokens: message.outputTokens,
  };
}

export async function listConversations(): Promise<
  { id: string; title: string; pinned: boolean; updatedAt: Date; messageCount: number }[]
> {
  const rows = await prisma.conversation.findMany({
    where: { archived: false },
    orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
    include: { _count: { select: { messages: true } } },
  });

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    pinned: row.pinned,
    updatedAt: row.updatedAt,
    messageCount: row._count.messages,
  }));
}

export async function getConversation(
  id: string,
): Promise<{ conversation: Conversation; messages: PlainMessage[] }> {
  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
  if (!conversation) throw notFound('ما لقينا هذي المحادثة');

  return {
    conversation,
    messages: conversation.messages.map(toPlain),
  };
}

export async function createConversation(title?: string): Promise<Conversation> {
  return prisma.conversation.create({
    data: { title: title?.trim() || 'محادثة جديدة' },
  });
}

export async function renameConversation(id: string, title: string): Promise<Conversation> {
  const trimmed = title.trim();
  if (!trimmed) throw badRequest('العنوان ما ينفع يكون فاضي');
  return prisma.conversation.update({ where: { id }, data: { title: trimmed } });
}

export async function deleteConversation(id: string): Promise<void> {
  await prisma.conversation.delete({ where: { id } });
}

export async function togglePin(id: string, pinned: boolean): Promise<Conversation> {
  return prisma.conversation.update({ where: { id }, data: { pinned } });
}

/** يبني عنوانًا من أول رسالة، بدل "محادثة جديدة". */
function deriveTitle(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= 45) return clean || 'محادثة جديدة';
  return `${clean.slice(0, 45).trimEnd()}…`;
}

export interface SendOptions {
  conversationId: string;
  text: string;
  context?: PersonaContext;
  onChunk?: (chunk: string) => void;
  /** يُنادى قبل التوليد لما نبدأ بحثًا حيًا */
  onStatus?: (status: string) => void;
  signal?: AbortSignal;
  /** يجبر البحث حتى لو الحسّاس ما شافه ضروريًا */
  forceSearch?: boolean;
}

export interface SendResult {
  userMessage: PlainMessage;
  assistantMessage: PlainMessage;
  durationMs: number;
  /** الرد ناقص لأن المستخدم قطع أو صار خطأ بالنص */
  partial: boolean;
  /** مصادر البحث الحي إن استُخدم */
  sources: SearchResult[];
}

/**
 * يرسل رسالة للمحرك ويحفظ السؤال والجواب مشفّرين في قاعدة البيانات.
 */
export async function sendMessage(options: SendOptions): Promise<SendResult> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: options.conversationId },
    include: {
      messages: { orderBy: { createdAt: 'desc' }, take: HISTORY_LIMIT },
    },
  });
  if (!conversation) throw notFound('ما لقينا هذي المحادثة');

  const isFirstMessage = conversation.messages.length === 0;

  // نرتب التاريخ تصاعديًا ونستبعد رسائل النظام
  const history: ChatTurn[] = conversation.messages
    .slice()
    .reverse()
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: decrypt(m.content),
    }));

  const userMessage = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: 'user',
      content: encrypt(options.text),
    },
  });

  // نجمّع النص أثناء البث حتى لو انقطع الاتصال ما نضيّع الرد الجزئي
  let streamed = '';
  const startedAt = Date.now();

  // نحقن الذاكرة الدائمة والمعرفة الأنسب للرسالة الحالية
  const [memories, knowledge] = await Promise.all([
    memoriesForPrompt(options.text),
    knowledgeForPrompt(options.text),
  ]);

  // بحث حي لما السؤال يحتاج معلومة محدثة
  let sources: SearchResult[] = [];
  let searchResults: string | undefined;

  if (options.forceSearch || (env.AUTO_SEARCH && needsSearch(options.text))) {
    options.onStatus?.('ندوّر لك على النت…');
    const found = await searchContext(options.text);
    if (found) {
      searchResults = found.text;
      sources = found.sources;
      options.onStatus?.(`لقينا ${found.sources.length} مصدر`);
    }
  }

  const context: PersonaContext = {
    ...options.context,
    ...(memories.length > 0 ? { memories } : {}),
    ...(knowledge.length > 0 ? { knowledge } : {}),
    ...(searchResults ? { searchResults } : {}),
  };

  let result: Awaited<ReturnType<typeof generate>> | null = null;
  let failure: unknown = null;

  try {
    result = await generate({
      prompt: options.text,
      history,
      context,
      signal: options.signal,
      onChunk: (chunk) => {
        streamed += chunk;
        options.onChunk?.(chunk);
      },
    });
  } catch (error) {
    failure = error;
  }

  const finalText = (result?.text || streamed).trim();

  // لو ما طلع ولا حرف وفيه خطأ، نرمي الخطأ بعد ما رسالة المستخدم انحفظت
  if (!finalText && failure) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        updatedAt: new Date(),
        ...(isFirstMessage ? { title: deriveTitle(options.text) } : {}),
      },
    });
    throw failure;
  }

  const assistantMessage = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: 'assistant',
      content: encrypt(finalText),
      model: IDENTITY.engine,
      inputTokens: result?.inputTokens ?? null,
      outputTokens: result?.outputTokens ?? null,
      meta: {
        durationMs: result?.durationMs ?? Date.now() - startedAt,
        ...(sources.length > 0 ? { sources: sources as unknown as object[] } : {}),
        // الرد ناقص: إما المستخدم قطع، أو صار خطأ بالنص
        partial: Boolean(failure) || (result?.stopped ?? false),
        ...(result?.droppedContext?.length
          ? { droppedContext: result.droppedContext }
          : {}),
        ...(result ? { historyUsed: result.historyUsed } : {}),
      },
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      updatedAt: new Date(),
      ...(isFirstMessage ? { title: deriveTitle(options.text) } : {}),
    },
  });

  // الاستخراج يشتغل في الخلفية — ما نخلّي المستخدم ينتظره.
  // نتجاوزه للرسائل القصيرة (شكرًا، تمام…) لأنها ما تحمل معلومات دائمة.
  if (
    env.AUTO_MEMORY &&
    finalText &&
    !failure &&
    options.text.trim().length >= env.AUTO_MEMORY_MIN_CHARS
  ) {
    void extractMemories(options.text, finalText, assistantMessage.id);
  }

  return {
    userMessage: toPlain(userMessage),
    assistantMessage: toPlain(assistantMessage),
    durationMs: result?.durationMs ?? Date.now() - startedAt,
    partial: Boolean(failure) || (result?.stopped ?? false),
    sources,
  };
}

/**
 * يستخرج الذكريات الدائمة من تبادل واحد، على نفس المحرك المحلي.
 * يشتغل في الخلفية وما يرمي أخطاء — فشله ما يأثر على المحادثة.
 */
async function extractMemories(
  userText: string,
  assistantText: string,
  messageId: string,
): Promise<void> {
  try {
    const conversation = [
      `المستخدم: ${userText}`,
      `المساعد: ${assistantText.slice(0, 2000)}`,
    ].join('\n\n');

    const result = await generate({
      prompt: `${EXTRACTION_PROMPT}\n\n---\n\n${conversation}`,
      // بدون شخصية ولا تاريخ — مهمة استخراج بحتة
      context: {},
      temperature: 0.1,
      maxTokens: 600,
    });

    const extracted = parseExtraction(result.text);
    if (extracted.length > 0) {
      const saved = await saveExtracted(extracted, messageId);
      if (saved.length > 0) {
        logger.info(`الذاكرة: حفظنا ${saved.length} معلومة جديدة`);
      }
    }
  } catch (error) {
    logger.debug('تعذّر استخراج الذاكرة', error);
  }
}
