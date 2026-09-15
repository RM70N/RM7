import fs from 'node:fs/promises';
import Anthropic from '@anthropic-ai/sdk';
import { env, isClaudeConfigured } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

const MIME_MAP = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

/**
 * يقرأ صورة سبورة/ملزمة ويستخرج كل النص والمحتوى المكتوب فيها كنص عربي منظّم.
 * @param {string} imagePath
 * @param {string} mimetype
 * @returns {Promise<string>}
 */
export async function extractTextFromImage(imagePath, mimetype) {
  if (!isClaudeConfigured()) {
    throw new AppError(500, 'خدمة تحليل الصور غير مفعّلة على السيرفر حاليًا.');
  }

  const client = new Anthropic({ apiKey: env.anthropicApiKey });
  const buffer = await fs.readFile(imagePath);
  const mediaType = MIME_MAP[Object.keys(MIME_MAP).find((ext) => mimetype.includes(ext.slice(1)))] || mimetype;

  try {
    const response = await client.messages.create({
      model: env.claudeModel,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: buffer.toString('base64') },
            },
            {
              type: 'text',
              text: 'هذه صورة سبورة أو ملزمة دراسية. اكتب كل النص والمعادلات والرسومات الموصوفة الموجودة فيها بشكل منظم وواضح باللغة العربية (أو كما هي إذا كانت بلغة أخرى)، بدون أي تعليق إضافي منك — فقط المحتوى المستخرج.',
            },
          ],
        },
      ],
    });

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    if (!text) {
      throw new AppError(422, 'ما قدرنا نقرأ أي محتوى واضح من هذه الصورة.');
    }

    return text;
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error('فشل تحليل الصورة عبر Claude:', err);
    throw new AppError(502, 'فشل تحليل الصورة. حاول مرة ثانية بعد شوي.');
  }
}
