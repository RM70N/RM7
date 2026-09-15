import fs from 'node:fs/promises';
import { env, isGroqConfigured } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

// Groq API — endpoint متوافق مع صيغة OpenAI للتفريغ الصوتي.
// التوثيق: https://console.groq.com/docs/speech-text
const GROQ_TRANSCRIPTION_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

// Whisper يحدد صيغة الترميز غالبًا من امتداد اسم الملف المُرسَل — إرسال امتداد
// خاطئ (مثلاً .mp3 لملف webm فعليًا) قد يفشّل فك الترميز. نشتق الامتداد الصحيح
// من نوع MIME الحقيقي للملف بدل تثبيته دائمًا كـ mp3.
const EXT_BY_MIME = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/m4a': 'm4a',
  'audio/mp4': 'm4a',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
};

/**
 * يحوّل ملف صوتي إلى نص عبر Groq API (نموذج whisper-large-v3) مع طوابع زمنية.
 * @param {string} audioPath - مسار ملف الصوت المؤقت
 * @param {string} [mimetype] - نوع MIME الحقيقي للملف (يحدد الامتداد المُرسَل لـGroq)
 * @returns {Promise<{ text: string, segments: Array<{ start: number, end: number, text: string }> }>}
 */
export async function transcribeAudio(audioPath, mimetype = 'audio/mpeg') {
  if (!isGroqConfigured()) {
    throw new AppError(500, 'خدمة تحويل الصوت إلى نص غير مفعّلة على السيرفر حاليًا.');
  }

  const ext = EXT_BY_MIME[mimetype] || 'mp3';
  const buffer = await fs.readFile(audioPath);
  const form = new FormData();
  form.append('file', new Blob([buffer]), `audio.${ext}`);
  form.append('model', env.whisperModel);
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'segment');

  let response;
  try {
    response = await fetch(GROQ_TRANSCRIPTION_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.groqApiKey}` },
      body: form,
    });
  } catch (err) {
    logger.error('فشل الاتصال بخدمة Groq (تفريغ الصوت):', err);
    throw new AppError(502, 'ما قدرنا نتواصل مع خدمة تحويل الصوت إلى نص. تحقق من الاتصال وحاول مرة ثانية.');
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    logger.error('خطأ من Groq API:', response.status, detail);
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
