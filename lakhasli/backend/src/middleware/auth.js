import { auth, firebaseReady } from '../config/firebaseAdmin.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * يتحقق من Firebase ID Token المُرسَل في Authorization: Bearer <token>
 * ويضيف req.userId و req.userEmail عند النجاح.
 */
export const requireAuth = asyncHandler(async (req, res, next) => {
  if (!firebaseReady) {
    throw new AppError(500, 'السيرفر غير مهيّأ بعد (إعدادات Firebase ناقصة).');
  }

  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw new AppError(401, 'يجب تسجيل الدخول للمتابعة.');
  }

  try {
    const decoded = await auth.verifyIdToken(token);
    req.userId = decoded.uid;
    req.userEmail = decoded.email || null;
    next();
  } catch {
    throw new AppError(401, 'جلسة الدخول منتهية أو غير صالحة. سجّل الدخول مرة ثانية.');
  }
});
