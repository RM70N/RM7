import { Router } from 'express';
import { firestore, FieldValue } from '../config/firebaseAdmin.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadLecture } from '../middleware/upload.js';
import { validateLectureUpload } from '../utils/validation.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { runLecturePipeline } from '../services/pipelineService.js';
import { expandMindMapNode } from '../services/aiAnalysisService.js';
import fs from 'node:fs/promises';

export const lecturesRouter = Router();

lecturesRouter.post(
  '/',
  requireAuth,
  (req, res, next) => uploadLecture(req, res, (err) => (err ? next(err) : next())),
  asyncHandler(async (req, res) => {
    const { courseId, sourceType } = req.body;
    const file = req.file;

    try {
      validateLectureUpload({ sourceType, file });

      if (!courseId) throw new AppError(400, 'لازم تحدد المقرر قبل رفع المحاضرة.');

      const courseSnap = await firestore.collection('courses').doc(courseId).get();
      if (!courseSnap.exists || courseSnap.data().userId !== req.userId) {
        throw new AppError(404, 'المقرر غير موجود.');
      }

      const lectureRef = firestore.collection('lectures').doc();
      await lectureRef.set({
        userId: req.userId,
        courseId,
        uploadDate: FieldValue.serverTimestamp(),
        sourceType,
        originalFileName: file.originalname,
        processingStatus: 'uploading',
        createdAt: FieldValue.serverTimestamp(),
      });

      // رد فوري — المعالجة تكمل بالخلفية ولا تنتظرها الواجهة على نفس الطلب.
      res.status(202).json({ lectureId: lectureRef.id, processingStatus: 'uploading' });

      runLecturePipeline({
        lectureId: lectureRef.id,
        courseId,
        courseName: courseSnap.data().courseName,
        sourceType,
        filePath: file.path,
        mimetype: file.mimetype,
      });
    } catch (err) {
      if (file?.path) await fs.unlink(file.path).catch(() => {});
      throw err;
    }
  })
);

lecturesRouter.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const snap = await firestore.collection('lectures').doc(req.params.id).get();
    if (!snap.exists || snap.data().userId !== req.userId) {
      throw new AppError(404, 'المحاضرة غير موجودة.');
    }
    res.json({ id: snap.id, ...snap.data() });
  })
);

lecturesRouter.post(
  '/:id/expand-node',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { nodeTitle, requestType } = req.body;
    if (!nodeTitle) throw new AppError(400, 'حدد الفرع المطلوب توسيعه.');

    const snap = await firestore.collection('lectures').doc(req.params.id).get();
    if (!snap.exists || snap.data().userId !== req.userId) {
      throw new AppError(404, 'المحاضرة غير موجودة.');
    }
    const transcriptText = snap.data().transcriptText;
    if (!transcriptText) throw new AppError(422, 'لازم تنتهي معالجة المحاضرة أولًا.');

    const children = await expandMindMapNode({
      sourceText: transcriptText,
      nodeTitle,
      requestType: requestType === 'example' ? 'example' : 'clarify',
    });

    res.json({ children });
  })
);

lecturesRouter.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const ref = firestore.collection('lectures').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists || snap.data().userId !== req.userId) {
      throw new AppError(404, 'المحاضرة غير موجودة.');
    }
    await ref.delete();
    res.status(204).end();
  })
);
