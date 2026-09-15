import fs from 'node:fs/promises';
import { generateFromImage } from './geminiClient.js';
import { AppError } from '../utils/AppError.js';

/**
 * يقرأ صورة سبورة/ملزمة ويستخرج كل النص والمحتوى المكتوب فيها كنص عربي منظّم عبر Gemini.
 * @param {string} imagePath
 * @param {string} mimetype
 * @returns {Promise<string>}
 */
export async function extractTextFromImage(imagePath, mimetype) {
  const buffer = await fs.readFile(imagePath);

  const text = (
    await generateFromImage({
      base64Data: buffer.toString('base64'),
      mimeType: mimetype,
      prompt:
        'هذه صورة سبورة أو ملزمة دراسية. اكتب كل النص والمعادلات والرسومات الموصوفة الموجودة فيها بشكل منظم وواضح باللغة العربية (أو كما هي إذا كانت بلغة أخرى)، بدون أي تعليق إضافي منك — فقط المحتوى المستخرج.',
    })
  ).trim();

  if (!text) {
    throw new AppError(422, 'ما قدرنا نقرأ أي محتوى واضح من هذه الصورة.');
  }

  return text;
}
