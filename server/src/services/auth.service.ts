import argon2 from 'argon2';
import { SignJWT, jwtVerify } from 'jose';
import type { Owner } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { randomToken, sha256 } from '../lib/crypto.js';
import { AppError, unauthorized, tooManyRequests } from '../lib/errors.js';

const SESSION_TTL_DAYS = 30;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

const JWT_SECRET = new TextEncoder().encode(env.SESSION_SECRET);
const JWT_ISSUER = 'ahsmaha-ai';
const JWT_AUDIENCE = 'ahsmaha-owner';

/** إعدادات Argon2id — متوازنة بين الأمان والسرعة. */
const ARGON_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON_OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/**
 * يضمن وجود حساب المالك الوحيد.
 * ينشئه من OWNER_PASSWORD عند أول تشغيل، ولا يعيد إنشاءه أبدًا.
 */
export async function ensureOwner(): Promise<Owner | null> {
  const existing = await prisma.owner.findFirst();
  if (existing) return existing;

  const password = env.OWNER_PASSWORD?.trim();
  if (!password) {
    logger.warn(
      'ما فيه حساب مالك بعد. حط OWNER_PASSWORD في ملف .env وأعد التشغيل عشان ينحفظ مشفّر.',
    );
    return null;
  }
  if (password.length < 12) {
    throw new Error('OWNER_PASSWORD قصير — لازم 12 حرف على الأقل');
  }

  const owner = await prisma.owner.create({
    data: { passwordHash: await hashPassword(password) },
  });
  logger.info('تم إنشاء حساب المالك الوحيد بنجاح.');
  return owner;
}

export interface SessionResult {
  token: string;
  expiresAt: Date;
}

/** يسجّل الدخول ويُنشئ جلسة جديدة. */
export async function login(
  password: string,
  context: { userAgent?: string; ip?: string },
): Promise<SessionResult> {
  const owner = await prisma.owner.findFirst();
  if (!owner) {
    throw new AppError(
      503,
      'NOT_INITIALIZED',
      'النظام ما تهيّأ بعد — حط OWNER_PASSWORD في ملف .env وأعد التشغيل',
    );
  }

  if (owner.lockedUntil && owner.lockedUntil > new Date()) {
    const minutes = Math.ceil((owner.lockedUntil.getTime() - Date.now()) / 60000);
    throw tooManyRequests(`الحساب مقفول مؤقتًا. جرب بعد ${minutes} دقيقة.`);
  }

  const valid = await verifyPassword(owner.passwordHash, password);

  if (!valid) {
    const attempts = owner.failedAttempts + 1;
    const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;
    await prisma.owner.update({
      where: { id: owner.id },
      data: {
        failedAttempts: shouldLock ? 0 : attempts,
        lockedUntil: shouldLock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      },
    });
    await recordAudit('login.failed', { attempts }, context.ip);

    throw shouldLock
      ? tooManyRequests(`محاولات كثيرة خاطئة. الحساب مقفول ${LOCK_MINUTES} دقيقة.`)
      : unauthorized('الباسورد غلط');
  }

  const token = randomToken(48);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.owner.update({
      where: { id: owner.id },
      data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    }),
    prisma.session.create({
      data: {
        ownerId: owner.id,
        tokenHash: sha256(token),
        userAgent: context.userAgent?.slice(0, 500) ?? null,
        ipHash: context.ip ? sha256(context.ip) : null,
        expiresAt,
      },
    }),
  ]);

  await recordAudit('login.success', null, context.ip);

  const jwt = await new SignJWT({ sid: sha256(token) })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setSubject(owner.id)
    .setExpirationTime(expiresAt)
    .sign(JWT_SECRET);

  return { token: jwt, expiresAt };
}

/** يتحقق من الجلسة ويُعيد المالك، أو null إذا الجلسة غير صالحة. */
export async function resolveSession(jwt: string): Promise<{ owner: Owner; sessionId: string } | null> {
  let tokenHash: string;
  let ownerId: string;

  try {
    const { payload } = await jwtVerify(jwt, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    if (typeof payload.sid !== 'string' || typeof payload.sub !== 'string') return null;
    tokenHash = payload.sid;
    ownerId = payload.sub;
  } catch {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { owner: true },
  });

  if (!session || session.ownerId !== ownerId) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt <= new Date()) return null;

  // تحديث آخر ظهور بحد أقصى مرة كل 5 دقائق لتقليل الكتابة
  if (Date.now() - session.lastSeenAt.getTime() > 5 * 60_000) {
    await prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });
  }

  return { owner: session.owner, sessionId: session.id };
}

/** يُنهي جلسة واحدة. */
export async function logout(jwt: string): Promise<void> {
  try {
    const { payload } = await jwtVerify(jwt, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    if (typeof payload.sid === 'string') {
      await prisma.session.updateMany({
        where: { tokenHash: payload.sid, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  } catch {
    // جلسة غير صالحة أصلًا — لا شيء لإنهائه
  }
}

/** يُنهي كل الجلسات (تسجيل خروج من كل الأجهزة). */
export async function logoutAll(ownerId: string): Promise<number> {
  const result = await prisma.session.updateMany({
    where: { ownerId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

/** يغيّر باسورد المالك ويُنهي كل الجلسات الأخرى. */
export async function changePassword(
  ownerId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const owner = await prisma.owner.findUnique({ where: { id: ownerId } });
  if (!owner) throw unauthorized();

  if (!(await verifyPassword(owner.passwordHash, currentPassword))) {
    throw unauthorized('الباسورد الحالي غلط');
  }
  if (newPassword.length < 12) {
    throw new AppError(400, 'WEAK_PASSWORD', 'الباسورد الجديد لازم 12 حرف على الأقل');
  }

  await prisma.owner.update({
    where: { id: ownerId },
    data: { passwordHash: await hashPassword(newPassword) },
  });
  await logoutAll(ownerId);
  await recordAudit('password.changed', null);
}

/** يحذف الجلسات المنتهية — ينادى دوريًا. */
export async function purgeExpiredSessions(): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}

export async function recordAudit(
  action: string,
  detail?: unknown,
  ip?: string,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        detail: (detail ?? undefined) as never,
        ipHash: ip ? sha256(ip) : null,
      },
    });
  } catch (error) {
    logger.warn('تعذّر تسجيل حدث التدقيق', error);
  }
}
