import multer from 'multer';
import { env } from '../lib/env.js';
import { isSupported } from '../lib/parsers.js';
import { badRequest } from '../lib/errors.js';

/**
 * استقبال الملفات في الذاكرة — نشفّرها ونكتبها بأنفسنا،
 * عشان ما ينكتب أي ملف غير مشفّر على القرص.
 */
export const uploadDocuments = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.MAX_UPLOAD_MB * 1024 * 1024,
    files: 10,
  },
  fileFilter: (_req, file, callback) => {
    if (!isSupported(file.mimetype)) {
      callback(
        badRequest(
          `نوع الملف "${file.mimetype}" مو مدعوم. المدعوم: PDF، Word، Excel، CSV، نص، وصور.`,
        ),
      );
      return;
    }
    callback(null, true);
  },
});

/** أرشيف مضغوط لمشاريع المواقع (المرحلة 5). */
export const uploadArchive = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.MAX_UPLOAD_MB * 1024 * 1024,
    files: 1,
  },
});
