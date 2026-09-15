import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: 'المسار غير موجود.' });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) logger.error(err.message, err);
    return res.status(err.statusCode).json({ error: err.messageAr });
  }

  if (err?.type === 'entity.too.large' || err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'حجم الملف أكبر من الحد المسموح.' });
  }

  logger.error('خطأ غير متوقع:', err);
  return res.status(500).json({
    error: 'صار خطأ غير متوقع في السيرفر. حاول مرة ثانية بعد شوي.',
  });
}
