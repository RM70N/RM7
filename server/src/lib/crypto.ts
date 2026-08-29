import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { env } from './env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

/**
 * يقبل المفتاح كـ base64 أو hex أو نص عادي، ويُخرج دائمًا 32 بايت.
 */
function deriveKey(secret: string): Buffer {
  for (const encoding of ['base64', 'hex'] as const) {
    try {
      const buf = Buffer.from(secret, encoding);
      if (buf.length === KEY_BYTES && buf.toString(encoding).replace(/=+$/, '') === secret.replace(/=+$/, '')) {
        return buf;
      }
    } catch {
      // نتجاهل ونجرب الترميز التالي
    }
  }
  // اشتقاق ثابت من نص حر
  return createHash('sha256').update(secret, 'utf8').digest();
}

const KEY = deriveKey(env.ENCRYPTION_KEY);

/**
 * تشفير نص. الناتج: v1.<iv>.<tag>.<ciphertext> بترميز base64url.
 */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

/**
 * فك التشفير. النصوص غير المشفّرة تُعاد كما هي (توافق مع بيانات قديمة).
 */
export function decrypt(payload: string): string {
  if (!payload.startsWith('v1.')) return payload;

  const parts = payload.split('.');
  if (parts.length !== 4) return payload;

  const [, ivPart, tagPart, dataPart] = parts as [string, string, string, string];
  try {
    const iv = Buffer.from(ivPart, 'base64url');
    const tag = Buffer.from(tagPart, 'base64url');
    const data = Buffer.from(dataPart, 'base64url');
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) return payload;

    const decipher = createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('فشل فك تشفير البيانات — تأكد أن ENCRYPTION_KEY هو نفسه المستخدم وقت الحفظ');
  }
}

/** تشفير بيانات ثنائية (ملفات). */
export function encryptBuffer(input: Buffer): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(input), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

/** فك تشفير بيانات ثنائية. */
export function decryptBuffer(input: Buffer): Buffer {
  const iv = input.subarray(0, IV_BYTES);
  const tag = input.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const data = input.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

/** هاش ثابت (للرموز والعناوين) — ليس لكلمات المرور. */
export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** مقارنة آمنة ضد هجمات التوقيت. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** رمز عشوائي آمن. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}
