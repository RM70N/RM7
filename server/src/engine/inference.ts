import type { LlamaContext, LlamaModel } from 'node-llama-cpp';
import { loadModel } from './runtime.js';
import { fitSystemPrompt, type PersonaContext } from './persona.js';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../lib/errors.js';

/**
 * توليد الردود في محرك احسمها.
 *
 * llama.cpp ما يقدر يخدم أكثر من طلب على نفس السياق بنفس الوقت،
 * فنمشّي الطلبات في طابور واحد بالترتيب.
 */

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface GenerateOptions {
  prompt: string;
  history?: ChatTurn[];
  context?: PersonaContext;
  temperature?: number;
  maxTokens?: number;
  /** تُنادى مع كل قطعة نص جديدة — للستريمنق */
  onChunk?: (text: string) => void;
  /** لإلغاء التوليد إذا قفل المستخدم الاتصال */
  signal?: AbortSignal;
}

export interface GenerateResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  stopped: boolean;
  /** أقسام السياق اللي انسقطت عشان تدخل في نافذة السياق */
  droppedContext: string[];
  /** عدد الرسائل السابقة اللي دخلت فعلًا */
  historyUsed: number;
}

/** هامش أمان للرموز الخاصة وقوالب المحادثة. */
const SAFETY_MARGIN = 96;

let queue: Promise<unknown> = Promise.resolve();
let contextInstance: LlamaContext | null = null;

/** يمشّي المهام واحدة واحدة على المحرك. */
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function getContext(): Promise<{ context: LlamaContext; model: LlamaModel }> {
  const model = await loadModel();
  if (contextInstance) return { context: contextInstance, model };

  const contextSize = Math.min(env.ENGINE_CONTEXT_SIZE, model.trainContextSize);
  contextInstance = await model.createContext({
    contextSize,
    ...(env.ENGINE_THREADS > 0 ? { threads: env.ENGINE_THREADS } : {}),
  });
  logger.info(`سياق المحرك جاهز بحجم ${contextSize} رمز`);
  return { context: contextInstance, model };
}

/**
 * يقلّم تاريخ المحادثة من الأحدث للأقدم حتى يدخل في الميزانية.
 * نبدأ من آخر رسالة عشان السياق القريب هو الأهم.
 */
function fitHistory(
  history: ChatTurn[],
  countTokens: (text: string) => number,
  budget: number,
): ChatTurn[] {
  const kept: ChatTurn[] = [];
  let used = 0;

  for (let i = history.length - 1; i >= 0; i -= 1) {
    const turn = history[i]!;
    const cost = countTokens(turn.content) + 8; // هامش لقالب الدور
    if (used + cost > budget) break;
    used += cost;
    kept.unshift(turn);
  }

  return kept;
}

/** يولّد ردًا كاملًا، مع بث القطع أولًا بأول إذا أُعطي onChunk. */
export async function generate(options: GenerateOptions): Promise<GenerateResult> {
  return enqueue(async () => {
    const started = Date.now();
    const { context, model } = await getContext();
    const sequence = context.getSequence();

    const countTokens = (text: string): number => model.tokenize(text).length;
    const maxTokens = options.maxTokens ?? env.ENGINE_MAX_TOKENS;

    try {
      // ── ميزانية السياق ──
      // نافذة السياق = برومبت النظام + التاريخ + رسالة المستخدم + الرد
      const contextSize = context.contextSize;
      const promptTokens = countTokens(options.prompt);
      const replyBudget = Math.min(maxTokens, Math.floor(contextSize * 0.5));
      const available = contextSize - replyBudget - promptTokens - SAFETY_MARGIN;

      if (available <= 0) {
        throw new AppError(
          400,
          'PROMPT_TOO_LONG',
          'رسالتك أطول من نافذة السياق. قصّرها شوي أو زوّد ENGINE_CONTEXT_SIZE.',
        );
      }

      // نعطي برومبت النظام 60% من المتاح، والباقي للتاريخ
      const systemBudget = Math.floor(available * 0.6);
      const fitted = fitSystemPrompt(options.context ?? {}, countTokens, systemBudget);

      const systemTokens = countTokens(fitted.prompt);
      const historyBudget = available - systemTokens;
      const history = fitHistory(options.history ?? [], countTokens, Math.max(0, historyBudget));

      if (fitted.dropped.length > 0) {
        logger.debug(`أسقطنا من السياق: ${fitted.dropped.join(', ')}`);
      }

      // ── التوليد ──
      const { LlamaChatSession } = await import('node-llama-cpp');
      const session = new LlamaChatSession({
        contextSequence: sequence,
        systemPrompt: fitted.prompt,
        autoDisposeSequence: false,
      });

      if (history.length > 0) {
        const chatHistory = session.getChatHistory();
        for (const turn of history) {
          chatHistory.push(
            turn.role === 'user'
              ? { type: 'user', text: turn.content }
              : { type: 'model', response: [turn.content] },
          );
        }
        session.setChatHistory(chatHistory);
      }

      let text = '';

      const response = await session.prompt(options.prompt, {
        temperature: options.temperature ?? env.ENGINE_TEMPERATURE,
        maxTokens: replyBudget,
        signal: options.signal,
        stopOnAbortSignal: true,
        onTextChunk: (chunk: string) => {
          text += chunk;
          options.onChunk?.(chunk);
        },
      });

      return {
        text: (response || text).trim(),
        inputTokens: sequence.tokenMeter.usedInputTokens,
        outputTokens: sequence.tokenMeter.usedOutputTokens,
        durationMs: Date.now() - started,
        stopped: options.signal?.aborted ?? false,
        droppedContext: fitted.dropped,
        historyUsed: history.length,
      };
    } finally {
      sequence.dispose();
    }
  });
}

/** يفرّغ سياق المحرك (عند تبديل النموذج). */
export async function disposeContext(): Promise<void> {
  if (contextInstance) {
    await contextInstance.dispose();
    contextInstance = null;
  }
}

/** يتأكد أن المحرك جاهز، ويرمي خطأ عربي واضح إذا لأ. */
export async function assertEngineReady(): Promise<void> {
  try {
    await loadModel();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(503, 'ENGINE_ERROR', 'المحرك ما قدر يشتغل', error);
  }
}
