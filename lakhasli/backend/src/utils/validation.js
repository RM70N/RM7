import { AppError } from './AppError.js';
import { env } from '../config/env.js';

const ALLOWED_MIME = {
  audio: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/m4a', 'audio/mp4', 'audio/webm', 'audio/ogg'],
  video: ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska'],
  pdf: ['application/pdf'],
  image: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'],
};

const SOURCE_TYPES = ['audio', 'video', 'pdf', 'image'];

export function validateLectureUpload({ sourceType, file }) {
  if (!SOURCE_TYPES.includes(sourceType)) {
    throw new AppError(400, 'نوع الملف غير مدعوم. الأنواع المتاحة: صوت، فيديو، PDF، صورة.');
  }

  if (!file) {
    throw new AppError(400, 'ما وصل أي ملف. تأكد من اختيار ملف قبل الرفع.');
  }

  const allowed = ALLOWED_MIME[sourceType];
  if (!allowed.includes(file.mimetype)) {
    throw new AppError(
      400,
      `صيغة الملف (${file.mimetype}) ما تتوافق مع النوع المختار (${sourceType}).`
    );
  }

  const limitMb = { audio: env.limits.audioMb, video: env.limits.videoMb, pdf: env.limits.documentMb, image: env.limits.documentMb }[
    sourceType
  ];
  const sizeMb = file.size / (1024 * 1024);
  if (sizeMb > limitMb) {
    throw new AppError(
      413,
      `حجم الملف (${sizeMb.toFixed(1)} م.ب) أكبر من الحد المسموح لهذا النوع (${limitMb} م.ب).`
    );
  }
}
