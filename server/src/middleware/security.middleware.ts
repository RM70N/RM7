import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import type { RequestHandler } from 'express';
import { env } from '../lib/env.js';

/**
 * ترويسات الحماية.
 * ملاحظة: CSP معطّلة للـ API لأنها لا تُقدّم HTML، والواجهة تُقدَّم بترويستها الخاصة.
 */
export function securityHeaders(): RequestHandler {
  return helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' },
    // نطفيها لأن صفحات معاينة المواقع تُقدَّم من نفس الأصل بدونها،
    // والتعارض يطلع تحذيرًا في كونسول المتصفح بدون أي فايدة أمنية هنا
    originAgentCluster: false,
    hsts: env.isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
  });
}

/** يمنع أي فهرسة من محركات البحث على مستوى كل استجابة. */
export function noIndex(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader(
    'X-Robots-Tag',
    'noindex, nofollow, noarchive, nosnippet, noimageindex, notranslate',
  );
  next();
}

/** حد عام لكل الطلبات. */
export const generalLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: { code: 'TOO_MANY_REQUESTS', message: 'طلبات كثيرة — هدّي شوي' },
  },
});

/** حد صارم على تسجيل الدخول. */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'محاولات دخول كثيرة — استنى 15 دقيقة',
    },
  },
});
