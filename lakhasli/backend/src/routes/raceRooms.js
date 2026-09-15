import { Router } from 'express';
import { firestore, realtimeDb, FieldValue } from '../config/firebaseAdmin.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';

export const raceRoomsRouter = Router();

function roomCode() {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

raceRoomsRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { lectureId } = req.body;
    if (!lectureId) throw new AppError(400, 'لازم تحدد المحاضرة اللي بتسوي عليها السباق.');

    const lectureSnap = await firestore.collection('lectures').doc(lectureId).get();
    if (!lectureSnap.exists || lectureSnap.data().userId !== req.userId) {
      throw new AppError(404, 'المحاضرة غير موجودة.');
    }
    const quizQuestions = lectureSnap.data().quizQuestions || [];
    if (!quizQuestions.length) throw new AppError(422, 'ما فيه أسئلة جاهزة لهذه المحاضرة بعد.');

    const roomRef = firestore.collection('raceRooms').doc();
    const code = roomCode();

    await roomRef.set({
      hostUserId: req.userId,
      lectureId,
      code,
      participants: [req.userId],
      status: 'waiting',
      createdAt: FieldValue.serverTimestamp(),
    });

    await realtimeDb.ref(`raceRooms/${roomRef.id}`).set({
      code,
      status: 'waiting',
      currentQuestionIndex: 0,
      questions: quizQuestions,
      participants: { [req.userId]: { score: 0, streak: 0, joinedAt: Date.now() } },
    });

    res.status(201).json({ id: roomRef.id, code });
  })
);

raceRoomsRouter.post(
  '/join-by-code',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { code } = req.body;
    if (!code) throw new AppError(400, 'اكتب رمز الغرفة.');

    const snap = await firestore.collection('raceRooms').where('code', '==', code.toUpperCase()).limit(1).get();
    if (snap.empty) throw new AppError(404, 'ما فيه غرفة بهذا الرمز.');

    const roomDoc = snap.docs[0];
    if (roomDoc.data().status !== 'waiting') throw new AppError(400, 'السباق بدأ أو انتهى، ما تقدر تنضم الحين.');

    await roomDoc.ref.update({ participants: FieldValue.arrayUnion(req.userId) });
    await realtimeDb
      .ref(`raceRooms/${roomDoc.id}/participants/${req.userId}`)
      .set({ score: 0, streak: 0, joinedAt: Date.now() });

    res.json({ id: roomDoc.id });
  })
);

raceRoomsRouter.post(
  '/:id/join',
  requireAuth,
  asyncHandler(async (req, res) => {
    const ref = firestore.collection('raceRooms').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) throw new AppError(404, 'الغرفة غير موجودة.');
    if (snap.data().status !== 'waiting') throw new AppError(400, 'السباق بدأ أو انتهى، ما تقدر تنضم الحين.');

    await ref.update({ participants: FieldValue.arrayUnion(req.userId) });
    await realtimeDb
      .ref(`raceRooms/${req.params.id}/participants/${req.userId}`)
      .set({ score: 0, streak: 0, joinedAt: Date.now() });

    res.json({ joined: true });
  })
);

raceRoomsRouter.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const snap = await firestore.collection('raceRooms').doc(req.params.id).get();
    if (!snap.exists) throw new AppError(404, 'الغرفة غير موجودة.');
    const data = snap.data();
    if (data.hostUserId !== req.userId && !(data.participants || []).includes(req.userId)) {
      throw new AppError(403, 'ما عندك صلاحية دخول هذه الغرفة.');
    }
    res.json({ id: snap.id, ...data });
  })
);

raceRoomsRouter.post(
  '/:id/start',
  requireAuth,
  asyncHandler(async (req, res) => {
    const ref = firestore.collection('raceRooms').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) throw new AppError(404, 'الغرفة غير موجودة.');
    if (snap.data().hostUserId !== req.userId) throw new AppError(403, 'بس صاحب الغرفة يقدر يبدأ السباق.');

    await ref.update({ status: 'active' });
    await realtimeDb.ref(`raceRooms/${req.params.id}/status`).set('active');

    res.json({ status: 'active' });
  })
);
