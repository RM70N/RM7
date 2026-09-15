import { env, isGeminiConfigured } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

// Google Gemini API — REST مباشر (بدون SDK) حتى نتحكم بالضبط بصيغة الطلب/الرد.
// التوثيق: https://ai.google.dev/gemini-api/docs
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

async function callGemini(body, { errorMessage = 'فشل التحليل الذكي. حاول مرة ثانية بعد شوي.' } = {}) {
  if (!isGeminiConfigured()) {
    throw new AppError(500, 'خدمة التحليل الذكي غير مفعّلة على السيرفر حاليًا.');
  }

  const url = `${BASE_URL}/${env.geminiModel}:generateContent?key=${env.geminiApiKey}`;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    logger.error('فشل الاتصال بخدمة Gemini:', err);
    throw new AppError(502, 'ما قدرنا نتواصل مع خدمة التحليل الذكي. تحقق من الاتصال وحاول مرة ثانية.');
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    logger.error('خطأ من Gemini API:', response.status, detail);
    throw new AppError(502, errorMessage);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];

  if (candidate?.finishReason === 'SAFETY' || !candidate) {
    logger.error('Gemini رفض أو ما أرجع نتيجة:', JSON.stringify(data).slice(0, 500));
    throw new AppError(502, errorMessage);
  }

  const text = candidate.content?.parts?.map((p) => p.text || '').join('') || '';
  if (!text.trim()) {
    logger.error('Gemini أرجع رد فاضي:', JSON.stringify(data).slice(0, 500));
    throw new AppError(502, errorMessage);
  }

  return text;
}

/**
 * يطلب من Gemini مخرجات JSON منظمة حسب schema محدد.
 * @param {object} params
 * @param {string} [params.systemInstruction]
 * @param {string} params.prompt
 * @param {object} params.schema - Gemini responseSchema (OpenAPI subset، type بأحرف كبيرة)
 * @param {number} [params.maxOutputTokens]
 * @returns {Promise<any>} الناتج بعد JSON.parse
 */
export async function generateJson({ systemInstruction, prompt, schema, maxOutputTokens = 8192 }) {
  const body = {
    ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: schema,
      maxOutputTokens,
    },
  };

  const text = await callGemini(body, { errorMessage: 'ما قدرنا نفهم رد التحليل الذكي. حاول مرة ثانية.' });

  try {
    return JSON.parse(text);
  } catch (err) {
    logger.error('فشل تحليل JSON من Gemini:', text.slice(0, 500), err);
    throw new AppError(502, 'ما قدرنا نفهم رد التحليل الذكي. حاول مرة ثانية.');
  }
}

/**
 * يرسل صورة + نص لـGemini (رؤية متعددة الوسائط) ويرجّع نص عادي (بدون JSON schema).
 * @param {object} params
 * @param {string} params.prompt
 * @param {string} params.base64Data
 * @param {string} params.mimeType
 * @returns {Promise<string>}
 */
export async function generateFromImage({ prompt, base64Data, mimeType }) {
  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ inlineData: { mimeType, data: base64Data } }, { text: prompt }],
      },
    ],
    generationConfig: { maxOutputTokens: 4096 },
  };

  return callGemini(body, { errorMessage: 'فشل تحليل الصورة. حاول مرة ثانية بعد شوي.' });
}
