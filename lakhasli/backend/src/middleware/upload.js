import multer from 'multer';
import os from 'node:os';
import { env } from '../config/env.js';

const MAX_MB = Math.max(env.limits.audioMb, env.limits.videoMb, env.limits.documentMb);

// تخزين مؤقت على القرص (tmp) فقط أثناء المعالجة — يُحذف فورًا بعد الانتهاء.
// لا تُستخدم أي خدمة تخزين دائم (لا Firebase Storage ولا غيره).
function diskStorageWithSafeName() {
  return multer.diskStorage({
    destination: os.tmpdir(),
    filename: (req, file, cb) => {
      const safeExt = (file.originalname.match(/\.[a-zA-Z0-9]+$/)?.[0] || '').slice(0, 10);
      cb(null, `lakhasli-${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
    },
  });
}

export const uploadLecture = multer({
  storage: diskStorageWithSafeName(),
  limits: { fileSize: MAX_MB * 1024 * 1024 },
}).single('file');

// تسجيل صوتي قصير (تحدي "اشرح لصديق" — حد أقصى دقيقتين) — حجم أصغر بكثير من محاضرة كاملة.
export const uploadAudioClip = multer({
  storage: diskStorageWithSafeName(),
  limits: { fileSize: 15 * 1024 * 1024 },
}).single('file');
