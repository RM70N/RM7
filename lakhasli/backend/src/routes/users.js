import { Router } from 'express';
import { firestore, FieldValue } from '../config/firebaseAdmin.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { synthesizeSpeech } from '../services/tts.js';

export const usersRouter = Router();

const THEME_COST = 100;

async function computeWeeklySummary(userId) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const snap = await firestore
    .collection('studySessions')
    .where('userId', '==', userId)
    .where('date', '>=', weekAgo)
    .get();

  const sessions = snap.docs.map((d) => d.data());
  const lecturesStudied = new Set(sessions.map((s) => s.lectureId)).size;
  const totalCorrect = sessions.reduce((sum, s) => sum + (s.score || 0), 0);
  const totalTime = sessions.reduce((sum, s) => sum + (s.timeSpent || 0), 0);

  return {
    sessionsCount: sessions.length,
    lecturesStudied,
    totalCorrect,
    totalTimeMinutes: Math.round(totalTime / 60),
  };
}

usersRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const ref = firestore.collection('users').doc(req.userId);
    const snap = await ref.get();

    if (!snap.exists) {
      const initial = {
        name: req.userEmail?.split('@')[0] || 'طالب',
        email: req.userEmail,
        level: 1,
        points: 0,
        streakCount: 0,
        unlockedThemes: ['default'],
        activeFrame: 'default',
        createdAt: FieldValue.serverTimestamp(),
      };
      await ref.set(initial);
      return res.json({ id: req.userId, ...initial });
    }

    res.json({ id: snap.id, ...snap.data() });
  })
);

usersRouter.get(
  '/me/weekly-summary',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await computeWeeklySummary(req.userId));
  })
);

// يولّد مقطع صوتي (edge-tts) لملخص لحظة الفخر الأسبوعية عند الطلب فقط — بدون أي
// تخزين دائم للملف الصوتي (لا Firebase Storage ولا غيره)، اتساقًا مع بقية المشروع.
usersRouter.get(
  '/me/weekly-summary/audio',
  requireAuth,
  asyncHandler(async (req, res) => {
    const summary = await computeWeeklySummary(req.userId);
    const text = summary.sessionsCount
      ? `هذا الأسبوع سويت ${summary.sessionsCount} جلسة مراجعة، وراجعت ${summary.lecturesStudied} محاضرة، وقضيت ${summary.totalTimeMinutes} دقيقة بالمذاكرة. استمر على هالمستوى!`
      : 'ما سجّلت أي جلسة مراجعة هالأسبوع. يلا نبدأ من اليوم!';

    const audioBuffer = await synthesizeSpeech(text);
    res.set('Content-Type', 'audio/mpeg');
    res.send(audioBuffer);
  })
);

usersRouter.post(
  '/me/unlock-theme',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { themeId } = req.body;
    if (!themeId) throw new AppError(400, 'حدد الثيم المطلوب شراؤه.');

    const ref = firestore.collection('users').doc(req.userId);

    const result = await firestore.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new AppError(404, 'المستخدم غير موجود.');

      const data = snap.data();
      const unlocked = data.unlockedThemes || [];
      if (unlocked.includes(themeId)) throw new AppError(400, 'هذا الثيم عندك مسبقًا.');

      const points = data.points || 0;
      if (points < THEME_COST) throw new AppError(400, 'نقاطك ما تكفي لشراء هذا الثيم.');

      const newPoints = points - THEME_COST;
      const newUnlocked = [...unlocked, themeId];
      tx.update(ref, { points: newPoints, unlockedThemes: newUnlocked });
      return { points: newPoints, unlockedThemes: newUnlocked };
    });

    res.json(result);
  })
);

// شكل البطاقات (شكل بطاقاتي) — تخصيص بصري مجاني بالكامل، غير مرتبط بنقاط أو فتح مسبق.
const FLASHCARD_STYLES = ['simple', 'warm', 'sketch'];

usersRouter.post(
  '/me/flashcard-style',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { styleId } = req.body;
    if (!FLASHCARD_STYLES.includes(styleId)) throw new AppError(400, 'شكل بطاقات غير معروف.');

    const ref = firestore.collection('users').doc(req.userId);
    await ref.set({ flashcardStyle: styleId }, { merge: true });
    res.json({ flashcardStyle: styleId });
  })
);

usersRouter.post(
  '/me/active-frame',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { frameId } = req.body;
    const ref = firestore.collection('users').doc(req.userId);
    const snap = await ref.get();
    if (!snap.exists) throw new AppError(404, 'المستخدم غير موجود.');

    const unlocked = snap.data().unlockedThemes || [];
    if (!unlocked.includes(frameId)) throw new AppError(400, 'لازم تفتح هذا الإطار أولًا.');

    await ref.update({ activeFrame: frameId });
    res.json({ activeFrame: frameId });
  })
);
