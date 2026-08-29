import { createApp } from './app.js';
import { env } from './lib/env.js';
import { logger } from './lib/logger.js';
import { connectDatabase, disconnectDatabase } from './db/prisma.js';
import { ensureStorage } from './lib/storage.js';
import { ensureOwner, purgeExpiredSessions } from './services/auth.service.js';
import { closeRenderer } from './services/renderer.service.js';

const SESSION_PURGE_INTERVAL_MS = 60 * 60 * 1000;

async function main(): Promise<void> {
  await connectDatabase();
  logger.info('اتصلنا بقاعدة البيانات');

  await ensureStorage();
  await ensureOwner();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`احسمها AI شغّال على http://localhost:${env.PORT}`);
  });

  const purgeTimer = setInterval(() => {
    void purgeExpiredSessions()
      .then((count) => {
        if (count > 0) logger.debug(`حذفنا ${count} جلسة منتهية`);
      })
      .catch((error: unknown) => logger.warn('فشل تنظيف الجلسات', error));
  }, SESSION_PURGE_INTERVAL_MS);
  purgeTimer.unref();

  const shutdown = (signal: string): void => {
    logger.info(`استلمنا ${signal} — نطفي بهدوء`);
    clearInterval(purgeTimer);
    server.close(() => {
      void closeRenderer()
        .then(() => disconnectDatabase())
        .finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  logger.error('فشل تشغيل السيرفر', error);
  process.exit(1);
});
