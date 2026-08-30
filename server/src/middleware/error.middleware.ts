import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { env } from '../lib/env.js';

/**
 * أخطاء "الميزة مو متاحة" — نقص اعتماد اختياري، مو عطل.
 * تنرجع 503 للعميل بس تنسجّل تنبيهًا لا خطأ.
 */
export const DEGRADED_CODES = new Set(['NO_RENDERER', 'NO_FFMPEG', 'NO_MODEL', 'NO_ENGINE']);

/** مسار غير موجود. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `المسار ${req.method} ${req.path} ما هو موجود` },
  });
}

/** معالج الأخطاء الموحّد — آخر middleware في السلسلة. */
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) return next(error);

  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'البيانات المرسلة ناقصة أو غير صحيحة',
        fields: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    });
    return;
  }

  if (error instanceof AppError) {
    if (error.status >= 500) {
      // نقص أداة اختيارية (متصفح الرسم مثلًا) مو خلل في السيرفر —
      // نسجّله تنبيهًا عشان ما يغرق السجل بأخطاء على الأجهزة الخفيفة.
      if (DEGRADED_CODES.has(error.code)) {
        logger.warn(`ميزة مو متاحة: ${error.message}`);
      } else {
        logger.error(`AppError: ${error.message}`, error.detail);
      }
    }
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(env.isProduction ? {} : { detail: error.detail }),
      },
    });
    return;
  }

  logger.error('خطأ غير متوقع', error);
  res.status(500).json({
    error: {
      code: 'SERVER_ERROR',
      message: 'صار خلل داخلي، جرب مرة ثانية',
      ...(env.isProduction || !(error instanceof Error) ? {} : { detail: error.message }),
    },
  });
}

/** يلفّ معالج async حتى تُلتقط أخطاؤه في errorHandler. */
export function asyncHandler<T extends Request = Request>(
  handler: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void handler(req as T, res, next).catch(next);
  };
}
