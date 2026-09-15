import { Router } from 'express';
import { firestore, FieldValue } from '../config/firebaseAdmin.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { compareLectures } from '../services/comparisonService.js';

export const coursesRouter = Router();

coursesRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const snap = await firestore.collection('courses').where('userId', '==', req.userId).get();
    res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  })
);

coursesRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { courseName, professorName } = req.body;
    if (!courseName?.trim()) throw new AppError(400, 'اسم المقرر مطلوب.');

    const ref = firestore.collection('courses').doc();
    await ref.set({
      userId: req.userId,
      courseName: courseName.trim(),
      professorName: professorName?.trim() || '',
      professorFingerprint: { repeatedPhrases: [] },
      createdAt: FieldValue.serverTimestamp(),
    });
    res.status(201).json({ id: ref.id });
  })
);

coursesRouter.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const snap = await firestore.collection('courses').doc(req.params.id).get();
    if (!snap.exists || snap.data().userId !== req.userId) {
      throw new AppError(404, 'المقرر غير موجود.');
    }
    res.json({ id: snap.id, ...snap.data() });
  })
);

coursesRouter.get(
  '/:id/lectures',
  requireAuth,
  asyncHandler(async (req, res) => {
    const courseSnap = await firestore.collection('courses').doc(req.params.id).get();
    if (!courseSnap.exists || courseSnap.data().userId !== req.userId) {
      throw new AppError(404, 'المقرر غير موجود.');
    }
    // فرز بالذاكرة بدل orderBy على Firestore عمدًا — where + orderBy على حقلين مختلفين
    // يحتاج composite index يدوي التفعيل بكونسول Firestore، وعدد محاضرات المقرر الواحد
    // صغير أصلًا فالفرز بالذاكرة أبسط وما يحتاج أي إعداد إضافي.
    const snap = await firestore.collection('lectures').where('courseId', '==', req.params.id).get();
    const lectures = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    lectures.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    res.json(lectures);
  })
);

coursesRouter.post(
  '/:id/compare',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { lectureIdA, lectureIdB } = req.body;
    if (!lectureIdA || !lectureIdB) throw new AppError(400, 'لازم تحدد محاضرتين للمقارنة.');

    const courseSnap = await firestore.collection('courses').doc(req.params.id).get();
    if (!courseSnap.exists || courseSnap.data().userId !== req.userId) {
      throw new AppError(404, 'المقرر غير موجود.');
    }

    const [snapA, snapB] = await Promise.all([
      firestore.collection('lectures').doc(lectureIdA).get(),
      firestore.collection('lectures').doc(lectureIdB).get(),
    ]);

    if (!snapA.exists || !snapB.exists || snapA.data().userId !== req.userId || snapB.data().userId !== req.userId) {
      throw new AppError(404, 'إحدى المحاضرتين غير موجودة.');
    }
    if (!snapA.data().summaryText || !snapB.data().summaryText) {
      throw new AppError(422, 'لازم تكون المحاضرتين انتهت معالجتهما قبل المقارنة.');
    }

    const result = await compareLectures(req.params.id, { id: snapA.id, summaryText: snapA.data().summaryText }, {
      id: snapB.id,
      summaryText: snapB.data().summaryText,
    });

    res.status(201).json(result);
  })
);
