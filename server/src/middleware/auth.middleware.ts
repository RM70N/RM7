import type { NextFunction, Request, Response } from 'express';
import type { Owner } from '@prisma/client';
import { resolveSession } from '../services/auth.service.js';
import { unauthorized } from '../lib/errors.js';

export const SESSION_COOKIE = 'ahsmaha_session';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      owner?: Owner;
      sessionId?: string;
    }
  }
}

/** يقرأ رمز الجلسة من الكوكي أو من ترويسة Authorization. */
function readToken(req: Request): string | null {
  const cookieToken = req.cookies?.[SESSION_COOKIE];
  if (typeof cookieToken === 'string' && cookieToken.length > 0) return cookieToken;

  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);

  return null;
}

/** يمنع الوصول لأي شيء بدون جلسة صالحة. */
export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token = readToken(req);
  if (!token) return next(unauthorized());

  const session = await resolveSession(token);
  if (!session) return next(unauthorized('انتهت الجلسة — سجّل دخول مرة ثانية'));

  req.owner = session.owner;
  req.sessionId = session.sessionId;
  next();
}

/** يُرفق المالك إن وُجدت جلسة، بدون منع الوصول. */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token = readToken(req);
  if (token) {
    const session = await resolveSession(token);
    if (session) {
      req.owner = session.owner;
      req.sessionId = session.sessionId;
    }
  }
  next();
}
