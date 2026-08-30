import { createHmac } from 'node:crypto';
import { env } from './env.js';
import { safeEqual } from './crypto.js';

/**
 * رمز معاينة قصير العمر ومربوط بمشروع واحد.
 *
 * ليه نحتاجه؟ المعاينة تشتغل داخل iframe معزول (sandbox بدون
 * allow-same-origin)، وهذا يعطيها أصلًا معتمًا. المتصفح يعتبر أي طلب
 * يطلع منها طلبًا عابرًا للمواقع، فما يرسل كوكي الجلسة (SameSite=Lax).
 * النتيجة: ملفات الموقع (CSS، صور، سكربتات) ترجع 401 وينكسر التنسيق.
 *
 * الحل: نحط رمزًا موقّعًا داخل مسار المعاينة نفسه. الملفات تُطلب
 * بمسارات نسبية فترث الرمز تلقائيًا، بدون ما نضعّف إعدادات الكوكي.
 *
 * الرمز يخص مشروعًا واحدًا فقط وينتهي بسرعة، فلو تسرّب ما يفتح غير
 * معاينة ذاك المشروع ولفترة قصيرة.
 */

/** ساعتان تكفي لجلسة تعديل، وتظل قصيرة لو تسرّب الرابط. */
const TTL_MS = 2 * 60 * 60 * 1000;

function sign(projectId: string, expiresAt: number): string {
  return createHmac('sha256', env.SESSION_SECRET)
    .update(`preview:${projectId}:${expiresAt}`)
    .digest('base64url');
}

export function createPreviewToken(projectId: string, now = Date.now()): string {
  const expiresAt = now + TTL_MS;
  return `${expiresAt}.${sign(projectId, expiresAt)}`;
}

/** يتحقق أن الرمز موقّع لهذا المشروع وما انتهى. */
export function verifyPreviewToken(
  token: string,
  projectId: string,
  now = Date.now(),
): boolean {
  const separator = token.indexOf('.');
  if (separator <= 0) return false;

  const expiresAt = Number(token.slice(0, separator));
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return false;

  return safeEqual(token.slice(separator + 1), sign(projectId, expiresAt));
}

/** عمر الرمز بالثواني — نرجّعه للواجهة عشان تجدّده قبل ما ينتهي. */
export const PREVIEW_TOKEN_TTL_SEC = TTL_MS / 1000;
