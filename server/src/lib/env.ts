import { config as loadEnv } from 'dotenv';
import { resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { z } from 'zod';

const here = dirname(fileURLToPath(import.meta.url));
/** جذر المستودع: server/src/lib -> server/src -> server -> repo */
export const REPO_ROOT = resolve(here, '..', '..', '..');

loadEnv({ path: resolve(REPO_ROOT, '.env') });

const booleanish = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_URL: z.string().url().default('http://localhost:5173'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL مطلوب'),

  OWNER_PASSWORD: z.string().min(0).optional(),

  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET لازم يكون 32 حرف على الأقل — ولّده بـ npm run gen:secrets -w server'),
  ENCRYPTION_KEY: z
    .string()
    .min(1, 'ENCRYPTION_KEY مطلوب — ولّده بـ npm run gen:secrets -w server'),

  // --- محرك احسمها (استدلال محلي بالكامل) ---
  /** مجلد الأوزان */
  ENGINE_MODELS_DIR: z.string().default('./.models'),
  /** مسار ملف أوزان محدد (اختياري — وإلا يأخذ أول GGUF في المجلد) */
  ENGINE_MODEL_PATH: z.string().optional().default(''),
  /** حجم نافذة السياق */
  ENGINE_CONTEXT_SIZE: z.coerce.number().int().positive().default(8192),
  /** أقصى عدد رموز في الرد الواحد */
  ENGINE_MAX_TOKENS: z.coerce.number().int().positive().default(2048),
  /** درجة العشوائية: أقل = أدق، أعلى = أبدع */
  ENGINE_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.7),
  /** عدد الخيوط (0 = تلقائي) */
  ENGINE_THREADS: z.coerce.number().int().min(0).default(0),

  // --- البحث الحي ---
  /** عنوان SearxNG مستضاف عندك (اختياري — وإلا نستخدم DuckDuckGo) */
  SEARXNG_URL: z.string().optional().default(''),
  /** بحث تلقائي لما السؤال يحتاج معلومة محدثة */
  AUTO_SEARCH: booleanish.default('true'),

  // --- الذاكرة الدائمة ---
  /** استخراج الذكريات تلقائيًا بعد كل رد (يكلّف دورة توليد إضافية) */
  AUTO_MEMORY: booleanish.default('true'),
  /** أقل طول رسالة يستاهل الاستخراج */
  AUTO_MEMORY_MIN_CHARS: z.coerce.number().int().positive().default(15),

  STORAGE_DIR: z.string().default('./storage'),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(100),

  EMBEDDING_MODEL: z.string().default('Xenova/multilingual-e5-small'),
  EMBEDDING_DIM: z.coerce.number().int().positive().default(384),

  TRUST_PROXY: booleanish.default('false'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`إعدادات البيئة ناقصة أو غير صحيحة:\n${issues}\n\nراجع ملف .env.example`);
}

const raw = parsed.data;

const storageDir = isAbsolute(raw.STORAGE_DIR)
  ? raw.STORAGE_DIR
  : resolve(REPO_ROOT, raw.STORAGE_DIR);

export const env = {
  ...raw,
  STORAGE_DIR: storageDir,
  isProduction: raw.NODE_ENV === 'production',
  isDevelopment: raw.NODE_ENV === 'development',
  isTest: raw.NODE_ENV === 'test',
} as const;

export type Env = typeof env;
