import fs from 'node:fs/promises';
import { env, isWhisperConfigured } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

/**
 * يحوّل ملف صوتي إلى نص عبر Whisper API (مع طوابع زمنية على مستوى الجمل).
 * @param {string} audioPath - مسار ملف الصوت المؤقت
 * @returns {Promise<{ text: string, segments: Array<{ start: number, end: number, text: string }> }>}
 */
export async function transcribeAudio(audioPath) {
  if (!isWhisperConfigured()) {
    throw new AppError(500, 'خدمة تحويل الصوت إلى نص غير مفعّلة على السيرفر حاليًا.');
  }

  const buffer = await fs.readFile(audioPath);
  const form = new FormData();
  form.append('file', new Blob([buffer]), 'audio.mp3');
  form.append('model', env.whisperModel);
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'segment');

  let response;
  try {
    response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.openaiApiKey}` },
      body: form,
    });
  } catch (err) {
    logger.error('فشل الاتصال بخدمة Whisper:', err);
    throw new AppError(502, 'ما قدرنا نتواصل مع خدمة تحويل الصوت إلى نص. تحقق من الاتصال وحاول مرة ثانية.');
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    logger.error('خطأ من Whisper API:', response.status, detail);
    if (response.status === 413) {
      throw new AppError(413, 'حجم الملف الصوتي أكبر من حد خدمة التفريغ (25 م.ب).');
    }
    throw new AppError(502, 'فشل تحويل الصوت إلى نص. حاول مرة ثانية بعد شوي.');
  }

  const data = await response.json();
  const segments = (data.segments || []).map((s) => ({
    start: s.start,
    end: s.end,
    text: s.text?.trim() || '',
  }));

  if (!data.text || !data.text.trim()) {
    throw new AppError(422, 'ما قدرنا نسمع أي كلام واضح بهذا التسجيل. تأكد إن الصوت مسموع وحاول مرة ثانية.');
  }

  return { text: data.text.trim(), segments };
}
