import { randomBytes } from 'node:crypto';

/**
 * يولّد مفاتيح حماية جاهزة للصق في ملف .env
 * التشغيل: npm run gen:secrets -w server
 */
const sessionSecret = randomBytes(48).toString('base64url');
const encryptionKey = randomBytes(32).toString('base64');
const password = randomBytes(18).toString('base64url');

process.stdout.write(
  [
    '',
    'الصق هذي القيم في ملف .env:',
    '',
    `SESSION_SECRET=${sessionSecret}`,
    `ENCRYPTION_KEY=${encryptionKey}`,
    `OWNER_PASSWORD=${password}`,
    '',
    'ملاحظة: احفظ الباسورد في مكان آمن — بينحفظ مشفّر في قاعدة البيانات أول تشغيل.',
    '',
  ].join('\n'),
);
