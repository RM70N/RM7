import { firestore, FieldValue } from '../config/firebaseAdmin.js';
import { logger } from '../utils/logger.js';

/**
 * يدمج عبارات التشديد المكتشفة بهذه المحاضرة مع بصمة الأستاذ المتراكمة للمقرر.
 * @param {string} courseId
 * @param {string[]} newPhrases
 */
export async function mergeProfessorFingerprint(courseId, newPhrases) {
  if (!courseId || !newPhrases?.length) return;

  const courseRef = firestore.collection('courses').doc(courseId);

  try {
    await firestore.runTransaction(async (tx) => {
      const snap = await tx.get(courseRef);
      if (!snap.exists) return;

      const existing = snap.data().professorFingerprint?.repeatedPhrases || [];
      const map = new Map(existing.map((p) => [normalize(p.phrase), { phrase: p.phrase, count: p.count }]));

      for (const phrase of newPhrases) {
        const key = normalize(phrase);
        if (!key) continue;
        if (map.has(key)) {
          map.get(key).count += 1;
        } else {
          map.set(key, { phrase, count: 1 });
        }
      }

      const repeatedPhrases = [...map.values()].sort((a, b) => b.count - a.count).slice(0, 50);

      tx.update(courseRef, {
        'professorFingerprint.repeatedPhrases': repeatedPhrases,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (err) {
    logger.error('فشل تحديث بصمة الأستاذ:', err);
  }
}

/**
 * يعيد أبرز عبارات التشديد المعروفة لأستاذ المقرر (لاستخدامها كسياق بتحليل محاضرات جديدة).
 * @param {string} courseId
 * @returns {Promise<string[]>}
 */
export async function getKnownEmphasisPhrases(courseId) {
  if (!courseId) return [];
  const snap = await firestore.collection('courses').doc(courseId).get();
  if (!snap.exists) return [];
  const phrases = snap.data().professorFingerprint?.repeatedPhrases || [];
  return phrases.filter((p) => p.count >= 2).map((p) => p.phrase);
}

function normalize(phrase) {
  return (phrase || '').trim().toLowerCase();
}
