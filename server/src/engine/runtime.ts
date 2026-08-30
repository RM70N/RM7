import { existsSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import type { Llama, LlamaModel } from 'node-llama-cpp';
import { env, REPO_ROOT } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../lib/errors.js';

/**
 * نواة محرك احسمها.
 *
 * تحمّل الأوزان مرة وحدة وتبقيها في الذاكرة. التحميل كسول — أول طلب هو
 * اللي يشغّل النموذج، عشان السيرفر يقوم بسرعة حتى لو الأوزان كبيرة.
 */

export interface EngineInfo {
  ready: boolean;
  modelPath: string | null;
  modelName: string | null;
  modelSizeBytes: number | null;
  contextSize: number | null;
  gpu: string;
  cpuCores: number;
  llamaRelease: string | null;
}

let llamaInstance: Llama | null = null;
let modelInstance: LlamaModel | null = null;
let loadPromise: Promise<LlamaModel> | null = null;
let loadedPath: string | null = null;

/** مجلد الأوزان. */
export function modelsDir(): string {
  return isAbsolute(env.ENGINE_MODELS_DIR)
    ? env.ENGINE_MODELS_DIR
    : resolve(REPO_ROOT, env.ENGINE_MODELS_DIR);
}

/** يبحث عن ملف الأوزان: المحدد في الإعدادات، وإلا أول ملف GGUF في المجلد. */
export async function findModelFile(): Promise<string | null> {
  if (env.ENGINE_MODEL_PATH) {
    const explicit = isAbsolute(env.ENGINE_MODEL_PATH)
      ? env.ENGINE_MODEL_PATH
      : resolve(REPO_ROOT, env.ENGINE_MODEL_PATH);
    return existsSync(explicit) ? explicit : null;
  }

  const dir = modelsDir();
  if (!existsSync(dir)) return null;

  const entries = await readdir(dir);
  const gguf = entries.filter((name) => name.endsWith('.gguf')).sort();
  const first = gguf[0];
  return first ? join(dir, first) : null;
}

async function getLlamaInstance(): Promise<Llama> {
  if (llamaInstance) return llamaInstance;

  const { getLlama, LlamaLogLevel } = await import('node-llama-cpp');
  const logLevel = env.isDevelopment ? LlamaLogLevel.warn : LlamaLogLevel.error;

  try {
    llamaInstance = await getLlama({ build: 'never', logLevel });
  } catch (error) {
    // الثنائيات الجاهزة مبنية على glibc، وأندرويد (Termux) يستخدم
    // bionic فما تنفتح عنده. نبنيها من المصدر — بطيء مرة وحدة بس.
    logger.warn('الثنائي الجاهز ما اشتغل — نبني المحرك من المصدر (ياخذ وقت)', error);
    try {
      llamaInstance = await getLlama({ build: 'auto', logLevel });
    } catch (buildError) {
      throw new AppError(
        503,
        'NO_ENGINE',
        'ما قدرنا نشغّل محرك الاستدلال. على أندرويد تأكد من: pkg install build-essential cmake python',
        buildError instanceof Error ? buildError.message : String(buildError),
      );
    }
  }

  logger.info(
    `محرك احسمها جاهز — ${llamaInstance.gpu ? `تسريع ${llamaInstance.gpu}` : 'معالج فقط'}، ${llamaInstance.cpuMathCores} نواة`,
  );
  return llamaInstance;
}

/** يحمّل الأوزان (مرة وحدة فقط، حتى لو انطلبت من عدة طلبات بنفس الوقت). */
export async function loadModel(): Promise<LlamaModel> {
  if (modelInstance) return modelInstance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const modelPath = await findModelFile();
    if (!modelPath) {
      throw new AppError(
        503,
        'NO_MODEL',
        'ما فيه أوزان محمّلة بعد. نزّلها بالأمر: npm run engine:pull -w server',
      );
    }

    const llama = await getLlamaInstance();
    const started = Date.now();
    logger.info(`نحمّل الأوزان: ${modelPath}`);

    const model = await llama.loadModel({
      modelPath,
      gpuLayers: llama.gpu ? undefined : 0,
    });

    modelInstance = model;
    loadedPath = modelPath;
    logger.info(`الأوزان جاهزة خلال ${((Date.now() - started) / 1000).toFixed(1)} ثانية`);
    return model;
  })();

  try {
    return await loadPromise;
  } catch (error) {
    loadPromise = null;
    throw error;
  }
}

/** حالة المحرك — تُستخدم في واجهة الإعدادات وفحص الجاهزية. */
export async function engineInfo(): Promise<EngineInfo> {
  const modelPath = loadedPath ?? (await findModelFile());
  let modelSizeBytes: number | null = null;

  if (modelPath) {
    try {
      modelSizeBytes = (await stat(modelPath)).size;
    } catch {
      modelSizeBytes = null;
    }
  }

  return {
    ready: modelInstance !== null,
    modelPath,
    modelName: modelPath ? modelPath.split('/').pop()! : null,
    modelSizeBytes,
    contextSize: modelInstance?.trainContextSize ?? null,
    gpu: llamaInstance?.gpu ? String(llamaInstance.gpu) : 'cpu',
    cpuCores: llamaInstance?.cpuMathCores ?? 0,
    llamaRelease: llamaInstance?.llamaCppRelease?.release ?? null,
  };
}

/** يفرّغ الأوزان من الذاكرة (عند تبديل النموذج أو الإطفاء). */
export async function unloadModel(): Promise<void> {
  if (modelInstance) {
    await modelInstance.dispose();
    modelInstance = null;
    loadedPath = null;
    loadPromise = null;
    logger.info('فرّغنا الأوزان من الذاكرة');
  }
}
