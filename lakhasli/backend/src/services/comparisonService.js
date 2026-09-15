import { firestore, FieldValue } from '../config/firebaseAdmin.js';
import { generateJson } from './geminiClient.js';

const COMPARISON_SCHEMA = {
  type: 'OBJECT',
  properties: {
    conflicts: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          topic: { type: 'STRING' },
          note: { type: 'STRING', description: 'وصف التكرار أو التناقض بين المحاضرتين' },
        },
        required: ['topic', 'note'],
      },
    },
  },
  required: ['conflicts'],
};

/**
 * يقارن بين محاضرتين من نفس المقرر ويستخرج نقاط التكرار أو التناقض، ويحفظها بـ comparisons.
 * @param {string} courseId
 * @param {{ id: string, summaryText: string }} lectureA
 * @param {{ id: string, summaryText: string }} lectureB
 */
export async function compareLectures(courseId, lectureA, lectureB) {
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
"""`;

  const result = await generateJson({ prompt, schema: COMPARISON_SCHEMA, maxOutputTokens: 4000 });
  const conflicts = result?.conflicts || [];

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
