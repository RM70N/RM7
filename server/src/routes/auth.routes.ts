import { Router } from 'express';
import { z } from 'zod';
import { env } from '../lib/env.js';
import { prisma } from '../db/prisma.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { optionalAuth, requireAuth, SESSION_COOKIE } from '../middleware/auth.middleware.js';
import { loginLimiter } from '../middleware/security.middleware.js';
import {
  changePassword,
  login,
  logout,
  logoutAll,
  setupOwner,
} from '../services/auth.service.js';

const router = Router();

const loginSchema = z.object({
  password: z.string().min(1, 'اكتب الباسورد'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'اكتب الباسورد الحالي'),
  newPassword: z.string().min(12, 'الباسورد الجديد لازم 12 حرف على الأقل'),
});

function cookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax' as const,
    path: '/',
    expires: expiresAt,
  };
}

/**
 * حالة الجلسة الحالية. يرجع 200 دائمًا — حتى لو ما فيه جلسة —
 * حتى لا تظهر أخطاء 401 في كونسول المتصفح عند فتح الموقع.
 */
router.get(
  '/session',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const owner = req.owner;
    res.json({
      authenticated: Boolean(owner),
      owner: owner
        ? {
            id: owner.id,
            displayName: owner.displayName,
            lastLoginAt: owner.lastLoginAt,
            createdAt: owner.createdAt,
          }
        : null,
    });
  }),
);

/** هل النظام مهيّأ (فيه حساب مالك)؟ */
router.get(
  '/status',
  asyncHandler(async (_req, res) => {
    const ownerCount = await prisma.owner.count();
    res.json({ initialized: ownerCount > 0 });
  }),
);

/**
 * الإعداد الأول — يحدد باسورد المالك على سيرفر جديد.
 * مغلق تلقائيًا بعد إنشاء الحساب، وتحت نفس حد المحاولات.
 */
router.post(
  '/setup',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { password } = z
      .object({ password: z.string().min(12, 'الباسورد لازم 12 حرف على الأقل').max(200) })
      .parse(req.body);

    await setupOwner(password);

    // ندخّله على طول عشان ما يعيد كتابة الباسورد
    const { token, expiresAt } = await login(password, {
      userAgent: req.get('user-agent') ?? undefined,
      ip: req.ip,
    });
    res.cookie(SESSION_COOKIE, token, cookieOptions(expiresAt));
    res.status(201).json({ ok: true, expiresAt });
  }),
);

router.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { password } = loginSchema.parse(req.body);
    const { token, expiresAt } = await login(password, {
      userAgent: req.get('user-agent') ?? undefined,
      ip: req.ip,
    });
    res.cookie(SESSION_COOKIE, token, cookieOptions(expiresAt));
    res.json({ ok: true, expiresAt });
  }),
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token === 'string') await logout(token);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  }),
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const owner = req.owner!;
    res.json({
      id: owner.id,
      displayName: owner.displayName,
      lastLoginAt: owner.lastLoginAt,
      createdAt: owner.createdAt,
    });
  }),
);

router.post(
  '/change-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    await changePassword(req.owner!.id, currentPassword, newPassword);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true, message: 'تغيّر الباسورد. سجّل دخول من جديد.' });
  }),
);

router.post(
  '/logout-all',
  requireAuth,
  asyncHandler(async (req, res) => {
    const count = await logoutAll(req.owner!.id);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true, revoked: count });
  }),
);

export default router;
