import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { recordStudySession } from '../services/streakService.js';

export const studySessionsRouter = Router();

studySessionsRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { lectureId, score, totalQuestions, timeSpent } = req.body;
    if (!lectureId || typeof score !== 'number' || typeof totalQuestions !== 'number') {
      throw new AppError(400, 'بيانات الجلسة ناقصة.');
    }

    const result = await recordStudySession(req.userId, {
      lectureId,
      score,
      totalQuestions,
      timeSpent: timeSpent || 0,
    });

    res.status(201).json(result);
  })
);
