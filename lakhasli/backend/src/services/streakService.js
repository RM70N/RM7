import { firestore, FieldValue } from '../config/firebaseAdmin.js';

const POINTS_PER_SESSION = 10;

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

/**
 * يسجّل جلسة مذاكرة ويحدّث السلسلة والنقاط. أنواع النشاط المدعومة: quiz (اختبار
 * سريع — النجاح = 3 أسئلة صح على الأقل) وexplainChallenge (تحدي "اشرح لصديق" —
 * النجاح يُمرَّر صراحةً عبر session.passed بناءً على تقييم Gemini). السلسلة تُصفَّر
 * تلقائيًا لو فات يوم كامل بدون مراجعة (نحسبها كسل عند أول جلسة جديدة بدل الاعتماد
 * على مهمة مجدولة، لأن السيرفر هنا Express عادي وليس Cloud Functions).
 *
 * @param {string} userId
 * @param {{ lectureId: string, score: number, totalQuestions: number, timeSpent: number, activityType?: string, passed?: boolean }} session
 */
export async function recordStudySession(userId, session) {
  const userRef = firestore.collection('users').doc(userId);
  const sessionRef = firestore.collection('studySessions').doc();
  const today = new Date();
  const passed =
    session.passed !== undefined
      ? session.passed
      : session.totalQuestions > 0 && session.score / session.totalQuestions >= 0.6 && session.score >= 3;

  await firestore.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const userData = userSnap.exists ? userSnap.data() : {};

    let streakCount = userData.streakCount || 0;
    let points = userData.points || 0;
    const lastStudyDate = userData.lastStudyDate?.toDate?.() || null;

    if (passed) {
      if (!lastStudyDate) {
        streakCount = 1;
      } else {
        const gap = daysBetween(new Date(dayKey(lastStudyDate)), new Date(dayKey(today)));
        if (gap === 0) {
          // نفس اليوم — ما نزيد السلسلة مرتين، بس نضيف نقاط الجلسة
        } else if (gap === 1) {
          streakCount += 1;
        } else {
          streakCount = 1; // فات يوم أو أكثر — تصفير وبداية جديدة
        }
      }
      points += POINTS_PER_SESSION;
    }

    tx.set(
      userRef,
      {
        streakCount,
        points,
        ...(passed ? { lastStudyDate: FieldValue.serverTimestamp() } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    tx.set(sessionRef, {
      userId,
      lectureId: session.lectureId,
      activityType: session.activityType || 'quiz',
      date: FieldValue.serverTimestamp(),
      score: session.score,
      totalQuestions: session.totalQuestions,
      timeSpent: session.timeSpent,
      passed,
    });
  });

  const finalSnap = await userRef.get();
  return { sessionId: sessionRef.id, passed, ...finalSnap.data() };
}
