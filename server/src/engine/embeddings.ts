import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Llama, LlamaModel, LlamaEmbeddingContext } from 'node-llama-cpp';
import { logger } from '../lib/logger.js';
import { loadModel, modelsDir } from './runtime.js';

/**
 * التضمين الدلالي — يشتغل محليًا على llama.cpp، بدون أي مزود خارجي.
 *
 * يفضّل نموذج تضمين مخصص في .models/embed إن وُجد، وإلا يستخدم نموذج
 * المحادثة نفسه. إذا ما ضبط أي شي، يرجع null والاسترجاع يعتمد على
 * الكلمات المفتاحية فقط — النظام يظل شغّال.
 */

export interface EmbeddingInfo {
  available: boolean;
  dimensions: number | null;
  source: 'dedicated' | 'chat-model' | 'none';
  modelName: string | null;
  reason: string | null;
}

let embedContext: LlamaEmbeddingContext | null = null;
let embedModel: LlamaModel | null = null;
let info: EmbeddingInfo = {
  available: false,
  dimensions: null,
  source: 'none',
  modelName: null,
  reason: null,
};
let initPromise: Promise<void> | null = null;

/** مجلد نماذج التضمين المخصصة. */
export function embedModelsDir(): string {
  return join(modelsDir(), 'embed');
}

async function findDedicatedModel(): Promise<string | null> {
  const dir = embedModelsDir();
  if (!existsSync(dir)) return null;

  const files = (await readdir(dir)).filter((name) => name.endsWith('.gguf')).sort();
  const first = files[0];
  return first ? join(dir, first) : null;
}

async function initialize(): Promise<void> {
  const dedicated = await findDedicatedModel();

  try {
    if (dedicated) {
      const { getLlama, LlamaLogLevel } = await import('node-llama-cpp');
      const llama: Llama = await getLlama({
        build: 'never',
        logLevel: LlamaLogLevel.error,
      });
      embedModel = await llama.loadModel({ modelPath: dedicated });
      info.source = 'dedicated';
      info.modelName = dedicated.split('/').pop()!;
    } else {
      // نستخدم نموذج المحادثة نفسه — أبطأ وأبعاده أكبر، بس يشتغل
      embedModel = await loadModel();
      info.source = 'chat-model';
      info.modelName = 'نموذج المحادثة';
    }

    embedContext = await embedModel.createEmbeddingContext({
      contextSize: Math.min(2048, embedModel.trainContextSize),
    });

    // نقيس الأبعاد بتضمين تجريبي — العمود في قاعدة البيانات يقبل أي أبعاد
    const probe = await embedContext.getEmbeddingFor('اختبار');
    info.dimensions = probe.vector.length;
    info.available = true;
    info.reason = null;
    logger.info(
      `التضمين جاهز — ${info.modelName} بأبعاد ${info.dimensions} (${info.source === 'dedicated' ? 'نموذج مخصص' : 'نموذج المحادثة'})`,
    );
  } catch (error) {
    info = {
      available: false,
      dimensions: null,
      source: 'none',
      modelName: null,
      reason: 'ما قدرنا نشغّل التضمين — الاسترجاع بيعتمد على الكلمات المفتاحية.',
    };
    logger.warn('تعذّر تشغيل التضمين', error);
    await dispose();
  }
}

async function ensureReady(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = initialize();
  return initPromise;
}

/** حالة التضمين — للعرض في الإعدادات. */
export async function embeddingInfo(): Promise<EmbeddingInfo> {
  await ensureReady();
  return { ...info };
}

/** هل التضمين شغّال؟ */
export async function embeddingsAvailable(): Promise<boolean> {
  await ensureReady();
  return info.available;
}

/**
 * يحوّل نصًا إلى متجه. يرجع null إذا التضمين مو متاح.
 * النصوص الطويلة تُقص — التضمين يشتغل على نافذة محدودة.
 */
export async function embed(text: string): Promise<number[] | null> {
  await ensureReady();
  if (!info.available || !embedContext) return null;

  const clean = text.trim();
  if (!clean) return null;

  try {
    const result = await embedContext.getEmbeddingFor(clean.slice(0, 6000));
    return Array.from(result.vector);
  } catch (error) {
    logger.debug('فشل التضمين لهذا النص', error);
    return null;
  }
}

/** يضمّن مجموعة نصوص بالتسلسل (llama.cpp ما يدعم الدفعات هنا). */
export async function embedMany(texts: string[]): Promise<(number[] | null)[]> {
  const results: (number[] | null)[] = [];
  for (const text of texts) {
    results.push(await embed(text));
  }
  return results;
}

/** تشابه جيب التمام بين متجهين. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i += 1) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/** يحوّل المتجه لصيغة pgvector النصية. */
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

async function dispose(): Promise<void> {
  if (embedContext) {
    await embedContext.dispose();
    embedContext = null;
  }
  // نتخلص من النموذج المخصص فقط — نموذج المحادثة يديره runtime
  if (embedModel && info.source === 'dedicated') {
    await embedModel.dispose();
  }
  embedModel = null;
}
