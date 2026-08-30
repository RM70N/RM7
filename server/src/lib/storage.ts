import { mkdir, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import { env } from './env.js';
import { encryptBuffer, decryptBuffer } from './crypto.js';
import { badRequest } from './errors.js';

export const STORAGE_SUBDIRS = ['uploads', 'sites', 'generated', 'tmp'] as const;
export type StorageArea = (typeof STORAGE_SUBDIRS)[number];

/** ينشئ مجلدات التخزين إن لم تكن موجودة. */
export async function ensureStorage(): Promise<void> {
  for (const dir of STORAGE_SUBDIRS) {
    await mkdir(join(env.STORAGE_DIR, dir), { recursive: true });
  }
}

/**
 * يحوّل مسارًا نسبيًا إلى مسار مطلق داخل مجلد التخزين فقط.
 * يمنع الخروج خارج المجلد (path traversal / zip-slip).
 */
export function resolveStoragePath(relPath: string): string {
  const cleaned = normalize(relPath).replace(/^([./\\])+/, '');
  const absolute = resolve(env.STORAGE_DIR, cleaned);
  const root = resolve(env.STORAGE_DIR);
  if (absolute !== root && !absolute.startsWith(root + sep)) {
    throw badRequest('مسار ملف غير مسموح فيه');
  }
  return absolute;
}

/** يكتب ملفًا مشفّرًا على القرص ويُعيد مساره النسبي. */
export async function writeEncrypted(relPath: string, data: Buffer): Promise<string> {
  const absolute = resolveStoragePath(relPath);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, encryptBuffer(data));
  return relPath;
}

/** يقرأ ملفًا مشفّرًا من القرص. */
export async function readEncrypted(relPath: string): Promise<Buffer> {
  const absolute = resolveStoragePath(relPath);
  return decryptBuffer(await readFile(absolute));
}

/** يكتب ملفًا نصيًا عاديًا (غير مشفّر) — للمواقع المرفوعة والمخرجات المعروضة. */
export async function writePlain(relPath: string, data: Buffer | string): Promise<string> {
  const absolute = resolveStoragePath(relPath);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, data);
  return relPath;
}

/** يقرأ ملفًا عاديًا. */
export async function readPlain(relPath: string): Promise<Buffer> {
  return readFile(resolveStoragePath(relPath));
}

/** يحذف ملفًا أو مجلدًا داخل التخزين. */
export async function removePath(relPath: string): Promise<void> {
  await rm(resolveStoragePath(relPath), { recursive: true, force: true });
}

/** هل المسار موجود؟ */
export async function pathExists(relPath: string): Promise<boolean> {
  try {
    await stat(resolveStoragePath(relPath));
    return true;
  } catch {
    return false;
  }
}
