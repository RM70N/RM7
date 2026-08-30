import type { Memory, MemoryCategory } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { logger } from '../lib/logger.js';
import { badRequest, notFound } from '../lib/errors.js';

/**
 * الذاكرة الدائمة لاحسمها.
 *
 * كل معلومة أو تفضيل يعطيه المالك ينحفظ هنا، ويرجع يُحقن في كل محادثة جاية.
 * ما يضيع شي عند إغلاق المتصفح ولا إعادة تشغيل السيرفر.
 */

/** أقصى عدد ذكريات نحقنها في برومبت النظام. */
export const INJECT_LIMIT = 25;

/** أقصى عدد ذكريات تلقائية نحتفظ فيها قبل ما نبدأ نشيل الأضعف. */
const AUTO_MEMORY_CAP = 300;

export const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  personal: 'شخصي',
  preference: 'تفضيل',
  project: 'مشروع',
  fact: 'معلومة',
  instruction: 'تعليمات',
};

export interface MemoryInput {
  title: string;
  content: string;
  category?: MemoryCategory;
  importance?: number;
  pinned?: boolean;
  source?: string;
  sourceRef?: string;
}

export async function listMemories(filter?: {
  category?: MemoryCategory;
  search?: string;
}): Promise<Memory[]> {
  const search = filter?.search?.trim();

  return prisma.memory.findMany({
    where: {
      ...(filter?.category ? { category: filter.category } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { content: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: [{ pinned: 'desc' }, { importance: 'desc' }, { updatedAt: 'desc' }],
  });
}

export async function createMemory(input: MemoryInput): Promise<Memory> {
  const title = input.title.trim();
  const content = input.content.trim();
  if (!title) throw badRequest('العنوان ما ينفع يكون فاضي');
  if (!content) throw badRequest('المحتوى ما ينفع يكون فاضي');

  return prisma.memory.create({
    data: {
      title,
      content,
      category: input.category ?? 'fact',
      importance: clampImportance(input.importance),
      pinned: input.pinned ?? false,
      source: input.source ?? 'manual',
      sourceRef: input.sourceRef ?? null,
    },
  });
}

export async function updateMemory(id: string, input: Partial<MemoryInput>): Promise<Memory> {
  const existing = await prisma.memory.findUnique({ where: { id } });
  if (!existing) throw notFound('ما لقينا هذي الذكرى');

  const title = input.title?.trim();
  const content = input.content?.trim();
  if (title !== undefined && !title) throw badRequest('العنوان ما ينفع يكون فاضي');
  if (content !== undefined && !content) throw badRequest('المحتوى ما ينفع يكون فاضي');

  return prisma.memory.update({
    where: { id },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(content !== undefined ? { content } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.importance !== undefined
        ? { importance: clampImportance(input.importance) }
        : {}),
      ...(input.pinned !== undefined ? { pinned: input.pinned } : {}),
    },
  });
}

export async function deleteMemory(id: string): Promise<void> {
  const existing = await prisma.memory.findUnique({ where: { id } });
  if (!existing) throw notFound('ما لقينا هذي الذكرى');
  await prisma.memory.delete({ where: { id } });
}

export async function deleteAllMemories(source?: string): Promise<number> {
  const result = await prisma.memory.deleteMany({
    where: source ? { source, pinned: false } : { pinned: false },
  });
  return result.count;
}

function clampImportance(value: number | undefined): number {
  if (value === undefined) return 3;
  return Math.max(1, Math.min(5, Math.round(value)));
}

// ───────────────────────── الاسترجاع للحقن ─────────────────────────

/** يطبّع النص العربي عشان المقارنة تكون عادلة. */
export function normalizeArabic(text: string): string {
  return text
    .replace(/[إأآا]/g, 'ا')
    .replace(/[ىي]/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ًٌٍَُِّْـ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** كلمات وقف عربية وإنجليزية — ما تفيد في المطابقة. */
const STOP_WORDS = new Set([
  'من', 'الى', 'على', 'في', 'عن', 'مع', 'هذا', 'هذي', 'هذه', 'ذلك', 'اللي',
  'التي', 'الذي', 'كان', 'كانت', 'يكون', 'ان', 'انا', 'انت', 'هو', 'هي',
  'وش', 'ايش', 'كيف', 'وين', 'ليش', 'متى', 'كل', 'بعض', 'قد', 'لا', 'ما',
  'the', 'a', 'an', 'is', 'are', 'was', 'to', 'of', 'in', 'on', 'for', 'and',
]);

function tokenize(text: string): Set<string> {
  return new Set(
    normalizeArabic(text)
      .split(' ')
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word)),
  );
}

/**
 * يختار الذكريات الأنسب للحقن في برومبت النظام.
 *
 * الترتيب: المثبّتة أولًا دائمًا، ثم الأعلى صلة بالرسالة الحالية،
 * ثم الأهم، ثم الأحدث.
 */
export function rankMemories(memories: Memory[], query: string, limit = INJECT_LIMIT): Memory[] {
  const queryTokens = tokenize(query);
  const now = Date.now();

  const scored = memories.map((memory) => {
    const memoryTokens = tokenize(`${memory.title} ${memory.content}`);

    let overlap = 0;
    for (const token of queryTokens) {
      if (memoryTokens.has(token)) overlap += 1;
    }
    const relevance = queryTokens.size > 0 ? overlap / queryTokens.size : 0;

    // الأحدث أعلى، بتلاشي على مدى 90 يوم
    const ageDays = (now - memory.updatedAt.getTime()) / 86_400_000;
    const recency = Math.max(0, 1 - ageDays / 90);

    const score =
      (memory.pinned ? 100 : 0) +
      relevance * 10 +
      memory.importance * 2 +
      recency;

    return { memory, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.memory);
}

/** يجهّز الذكريات كسطور جاهزة للحقن في برومبت النظام. */
export async function memoriesForPrompt(query: string): Promise<string[]> {
  const all = await prisma.memory.findMany();
  if (all.length === 0) return [];

  return rankMemories(all, query).map(
    (memory) => `[${CATEGORY_LABELS[memory.category]}] ${memory.title}: ${memory.content}`,
  );
}

// ───────────────────────── الاستخراج التلقائي ─────────────────────────

/** برومبت الاستخراج — يشتغل على نفس المحرك المحلي. */
export const EXTRACTION_PROMPT = `اقرأ المحادثة اللي تحت واستخرج المعلومات الدائمة عن المستخدم فقط.

استخرج بس اللي يفيد في محادثات جاية:
- معلومات شخصية ثابتة (اسمه، شغله، مدينته، عائلته)
- تفضيلاته (لغات يحبها، أدوات يستخدمها، أسلوب يفضّله)
- مشاريعه وأهدافه
- تعليمات يبيك تلتزم فيها دائمًا

لا تستخرج:
- أسئلة عابرة أو طلبات لمرة وحدة
- معلومات عامة ما لها علاقة فيه شخصيًا
- شي قاله المساعد مو المستخدم

رد بـ JSON فقط بهذا الشكل، وبدون أي كلام قبله أو بعده:
[{"title":"عنوان قصير","content":"التفصيل","category":"personal|preference|project|fact|instruction","importance":1-5}]

إذا ما فيه شي يستاهل الحفظ، رد بـ: []`;

const VALID_CATEGORIES: MemoryCategory[] = [
  'personal',
  'preference',
  'project',
  'fact',
  'instruction',
];

export interface ExtractedMemory {
  title: string;
  content: string;
  category: MemoryCategory;
  importance: number;
}

/**
 * يحلّل رد المحرك ويطلع منه الذكريات.
 * متسامح: يقبل JSON مغلّف بـ ``` أو محاط بكلام زايد، ويتجاهل أي عنصر غير صالح.
 */
export function parseExtraction(raw: string): ExtractedMemory[] {
  if (!raw?.trim()) return [];

  // نشيل تغليف الماركداون إن وجد
  let text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');

  // ندوّر على أول مصفوفة JSON في النص
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) return [];
  text = text.slice(start, end + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const result: ExtractedMemory[] = [];

  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) continue;
    const record = item as Record<string, unknown>;

    const title = typeof record.title === 'string' ? record.title.trim() : '';
    const content = typeof record.content === 'string' ? record.content.trim() : '';
    if (!title || !content) continue;
    if (title.length > 200 || content.length > 2000) continue;

    const category =
      typeof record.category === 'string' &&
      VALID_CATEGORIES.includes(record.category as MemoryCategory)
        ? (record.category as MemoryCategory)
        : 'fact';

    const importanceRaw = Number(record.importance);
    const importance = Number.isFinite(importanceRaw)
      ? Math.max(1, Math.min(5, Math.round(importanceRaw)))
      : 3;

    result.push({ title, content, category, importance });
  }

  return result;
}

/** هل الذكرى الجديدة مكرّرة مع وحدة موجودة؟ */
export function isDuplicate(candidate: ExtractedMemory, existing: Memory[]): boolean {
  const candidateNorm = normalizeArabic(`${candidate.title} ${candidate.content}`);
  const candidateTokens = tokenize(`${candidate.title} ${candidate.content}`);
  if (candidateTokens.size === 0) return true;

  for (const memory of existing) {
    const memoryNorm = normalizeArabic(`${memory.title} ${memory.content}`);
    if (memoryNorm === candidateNorm) return true;

    const memoryTokens = tokenize(`${memory.title} ${memory.content}`);
    let shared = 0;
    for (const token of candidateTokens) {
      if (memoryTokens.has(token)) shared += 1;
    }
    // تشابه 80% فأكثر = مكرّر
    if (shared / candidateTokens.size >= 0.8) return true;
  }

  return false;
}

/** يحفظ الذكريات المستخرجة، ويتجاهل المكرّر. */
export async function saveExtracted(
  extracted: ExtractedMemory[],
  sourceRef: string,
): Promise<Memory[]> {
  if (extracted.length === 0) return [];

  const existing = await prisma.memory.findMany();
  const saved: Memory[] = [];

  for (const candidate of extracted) {
    if (isDuplicate(candidate, [...existing, ...saved])) continue;

    saved.push(
      await prisma.memory.create({
        data: {
          title: candidate.title,
          content: candidate.content,
          category: candidate.category,
          importance: candidate.importance,
          source: 'auto',
          sourceRef,
        },
      }),
    );
  }

  if (saved.length > 0) {
    logger.debug(`حفظنا ${saved.length} ذكرى تلقائية`);
    await pruneAutoMemories();
  }

  return saved;
}

/** يشيل أضعف الذكريات التلقائية إذا تجاوزنا الحد. */
async function pruneAutoMemories(): Promise<void> {
  const count = await prisma.memory.count({ where: { source: 'auto', pinned: false } });
  if (count <= AUTO_MEMORY_CAP) return;

  const excess = await prisma.memory.findMany({
    where: { source: 'auto', pinned: false },
    orderBy: [{ importance: 'asc' }, { updatedAt: 'asc' }],
    take: count - AUTO_MEMORY_CAP,
    select: { id: true },
  });

  await prisma.memory.deleteMany({
    where: { id: { in: excess.map((m) => m.id) } },
  });
  logger.debug(`شلنا ${excess.length} ذكرى تلقائية ضعيفة`);
}

export async function memoryStats(): Promise<{
  total: number;
  pinned: number;
  auto: number;
  manual: number;
  byCategory: Record<string, number>;
}> {
  const [total, pinned, auto, grouped] = await Promise.all([
    prisma.memory.count(),
    prisma.memory.count({ where: { pinned: true } }),
    prisma.memory.count({ where: { source: 'auto' } }),
    prisma.memory.groupBy({ by: ['category'], _count: true }),
  ]);

  return {
    total,
    pinned,
    auto,
    manual: total - auto,
    byCategory: Object.fromEntries(grouped.map((g) => [g.category, g._count])),
  };
}
