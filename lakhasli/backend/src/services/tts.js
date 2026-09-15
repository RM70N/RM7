import { spawn } from 'node:child_process';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

// صوت عربي (سعودي) قياسي من Microsoft Edge Neural TTS. يمكن تغييره عبر متغير بيئة
// TTS_VOICE بدون تعديل الكود لو احتجت صوتًا آخر (اعرض الأصوات المتاحة بأمر:
// `edge-tts --list-voices` على جهاز له اتصال بالإنترنت).
const DEFAULT_VOICE = process.env.TTS_VOICE || 'ar-SA-HamedNeural';

/**
 * يولّد مقطع صوتي (MP3) من نص عربي عبر edge-tts (يعمل كعملية فرعية Python، بدون
 * أي مفتاح API). يُنتج الصوت مباشرة بالذاكرة (stdout) — لا يُخزَّن على القرص ولا بأي
 * خدمة تخزين خارجية، اتساقًا مع قرار عدم استخدام Firebase Storage بهذا المشروع.
 * يُستدعى عند الطلب فقط (مثلاً زر "استمع" بلحظة الفخر الأسبوعية) بدون أي تخزين مؤقت.
 * @param {string} text
 * @param {string} [voice]
 * @returns {Promise<Buffer>}
 */
export function synthesizeSpeech(text, voice = DEFAULT_VOICE) {
  return new Promise((resolve, reject) => {
    if (!text?.trim()) {
      reject(new AppError(400, 'ما فيه نص لتحويله لصوت.'));
      return;
    }

    const child = spawn('edge-tts', ['--text', text, '--voice', voice, '--write-media', '-']);

    const chunks = [];
    let stderr = '';

    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk.toString()));

    child.on('error', (err) => {
      logger.error('edge-tts غير متوفر على السيرفر:', err);
      reject(new AppError(500, 'خدمة تحويل النص إلى صوت غير مفعّلة على السيرفر حاليًا.'));
    });

    child.on('close', (code) => {
      if (code !== 0) {
        logger.error('فشل edge-tts:', stderr);
        reject(new AppError(502, 'فشل توليد المقطع الصوتي. حاول مرة ثانية.'));
        return;
      }
      const buffer = Buffer.concat(chunks);
      if (!buffer.length) {
        reject(new AppError(502, 'ما قدرنا نولّد صوتًا لهذا النص.'));
        return;
      }
      resolve(buffer);
    });
  });
}
