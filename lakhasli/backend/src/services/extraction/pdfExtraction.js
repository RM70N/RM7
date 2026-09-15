import fs from 'node:fs/promises';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';

/**
 * يستخرج النص من ملف PDF. إذا كان الملف عبارة عن صور ممسوحة (بدون نص)
 * يرمي خطأ واضح للطالب بدل نص فاضي.
 * @param {string} pdfPath
 * @returns {Promise<string>}
 */
export async function extractTextFromPdf(pdfPath) {
  try {
    const buffer = await fs.readFile(pdfPath);
    const result = await pdfParse(buffer);
    const text = (result.text || '').trim();

    if (text.length < 20) {
      throw new AppError(
        422,
        'ما قدرنا نستخرج نص من هذا الـ PDF — يبدو إنه صور ممسوحة ضوئيًا وليس نصًا. جرّب رفعه كصورة بدل ذلك.'
      );
    }

    return text;
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error('فشل قراءة PDF:', err);
    throw new AppError(422, 'ما قدرنا نقرأ ملف الـ PDF. تأكد إنه غير تالف.');
  }
}
