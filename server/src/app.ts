import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import express, { type Express } from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { env, REPO_ROOT } from './lib/env.js';
import { logger } from './lib/logger.js';
import routes from './routes/index.js';
import v1Routes from './routes/v1.routes.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import {
  generalLimiter,
  noIndex,
  securityHeaders,
} from './middleware/security.middleware.js';

export function createApp(): Express {
  const app = express();

  if (env.TRUST_PROXY) app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(securityHeaders());
  app.use(noIndex);
  app.use(compression());
  app.use(
    cors({
      origin: env.APP_URL,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));
  app.use(cookieParser());
  app.use(generalLimiter);

  // منع الفهرسة نهائيًا
  app.get('/robots.txt', (_req, res) => {
    res.type('text/plain').send('User-agent: *\nDisallow: /\n');
  });

  // API احسمها العام — بمفاتيح يصدرها المالك
  app.use('/api/v1', v1Routes);

  app.use('/api', routes);

  // في الإنتاج نقدّم الواجهة المبنية من نفس الخدمة — خدمة وحدة ومنفذ واحد
  const webDist = resolve(REPO_ROOT, 'web', 'dist');

  if (existsSync(join(webDist, 'index.html'))) {
    // الأصول لها بصمة في اسمها فنخزّنها طويلًا، وindex.html أبدًا
    app.use(
      express.static(webDist, {
        index: false,
        maxAge: '1y',
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-store');
        },
      }),
    );

    // أي مسار مو تحت /api يرجّع الواجهة (تطبيق صفحة واحدة)
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.sendFile(join(webDist, 'index.html'));
    });

    logger.info('نقدّم الواجهة المبنية من نفس الخدمة');
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
