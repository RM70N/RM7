import type { NextFunction, Request, Response } from 'express';
import type { ApiKey } from '@prisma/client';
import { hasScope, verifyKey, type Scope } from '../services/apikey.service.js';
import { forbidden, unauthorized } from '../lib/errors.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      apiKey?: ApiKey;
    }
  }
}

/** يقرأ المفتاح من ترويسة x-ahsmaha-key أو Authorization. */
function readKey(req: Request): string | null {
  const header = req.get('x-ahsmaha-key');
  if (header) return header;

  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);

  return null;
}

/** يحمي مسارات API الخارجية بمفتاح احسمها. */
export function requireApiKey(scope: Scope) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const raw = readKey(req);
    if (!raw) {
      return next(unauthorized('محتاج مفتاح احسمها في ترويسة x-ahsmaha-key'));
    }

    const key = await verifyKey(raw);
    if (!key) return next(unauthorized('المفتاح غير صالح أو ملغي'));

    if (!hasScope(key, scope)) {
      return next(forbidden(`هذا المفتاح ما عنده صلاحية "${scope}"`));
    }

    req.apiKey = key;
    next();
  };
}
