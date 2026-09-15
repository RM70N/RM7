import Anthropic from '@anthropic-ai/sdk';
import { firestore, FieldValue } from '../config/firebaseAdmin.js';
import { env, isClaudeConfigured } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

const COMPARISON_TOOL = {
  name: 'submit_comparison',
  description: 'تسليم نتيجة مقارنة محاضرتين من نفس المقرر.',
  input_schema: {
    type: 'object',
    properties: {
      conflicts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            topic: { type: 'string' },
            note: { type: 'string', description: 'وصف التكرار أو التناقض بين المحاضرتين' },
          },
          required: ['topic', 'note'],
        },
      },
    },
    required: ['conflicts'],
  },
};

/**
 * يقارن بين محاضرتين من نفس المقرر ويستخرج نقاط التكرار أو التناقض، ويحفظها بـ comparisons.
 * @param {string} courseId
 * @param {{ id: string, summaryText: string }} lectureA
 * @param {{ id: string, summaryText: string }} lectureB
 */
export async function compareLectures(courseId, lectureA, lectureB) {
  if (!isClaudeConfigured()) {
    throw new AppError(500, 'خدمة المقارنة غير مفعّلة على السيرفر حاليًا.');
  }

  const client = new Anthropic({ apiKey: env.anthropicApiKey });

  const prompt = `قارن بين ملخصي محاضرتين من نفس المقرر الجامعي واستخرج:
- النقاط التي تكررت بالمحاضرتين (بنفس المعنى تقريبًا).
- أي تناقض واضح بالمعلومات بينهما.

الملخص الأول (محاضرة أ):
"""
${lectureA.summaryText.slice(0, 20000)}
"""

الملخص الثاني (محاضرة ب):
"""
${lectureB.summaryText.slice(0, 20000)}
"""

استخدم أداة submit_comparison فقط.`;

  let response;
  try {
    response = await client.messages.create({
      model: env.claudeModel,
      max_tokens: 4000,
      tools: [COMPARISON_TOOL],
      tool_choice: { type: 'tool', name: 'submit_comparison' },
      messages: [{ role: 'user', content: prompt }],
    });
  } catch (err) {
    logger.error('فشل استدعاء Claude للمقارنة:', err);
    throw new AppError(502, 'فشلت مقارنة المحاضرات. حاول مرة ثانية.');
  }

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  const conflicts = toolUse?.input?.conflicts || [];

  const comparisonRef = firestore.collection('comparisons').doc();
  const conflictsWithLectures = conflicts.map((c) => ({
    ...c,
    lectureA: lectureA.id,
    lectureB: lectureB.id,
  }));

  await comparisonRef.set({
    courseId,
    lectureIds: [lectureA.id, lectureB.id],
    conflicts: conflictsWithLectures,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { id: comparisonRef.id, conflicts: conflictsWithLectures };
}
