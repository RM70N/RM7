import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getDatabase } from 'firebase-admin/database';
import { getAuth } from 'firebase-admin/auth';
import { env, isFirebaseConfigured } from './env.js';
import { logger } from '../utils/logger.js';

let app = null;

if (isFirebaseConfigured()) {
  app = getApps().length
    ? getApps()[0]
    : initializeApp({
        credential: cert({
          projectId: env.firebase.projectId,
          clientEmail: env.firebase.clientEmail,
          privateKey: env.firebase.privateKey,
        }),
        databaseURL: env.firebase.databaseURL,
      });
} else {
  logger.warn('إعدادات Firebase غير مكتملة — تحقق من ملف .env قبل التشغيل الفعلي.');
}

export const firestore = app ? getFirestore(app) : null;
export const realtimeDb = app ? getDatabase(app) : null;
export const auth = app ? getAuth(app) : null;
export { FieldValue };
export const firebaseReady = Boolean(app);
