import { randomBytes } from 'node:crypto';
import type { ApiKey } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { hashPassword, verifyPassword } from './auth.service.js';
import { badRequest, notFound } from '../lib/errors.js';

/**
 * مفاتيح API الخاصة بـ احسمها.
 *
 * المفتاح يُعرض مرة وحدة عند الإصدار، وما نخزّن إلا هاشه.
 * البادئة تُخزَّن نصًا عشان نلقى المفتاح بسرعة بدون فحص كل الصفوف.
 */

export const SCOPES = ['chat', 'memory', 'knowledge', 'studio', 'search'] as const;
export type Scope = (typeof SCOPES)[number];

export const SCOPE_LABELS: Record<Scope, string> = {
  chat: 'المحادثة',
  memory: 'الذاكرة',
  knowledge: 'المعرفة والملفات',
  studio: 'الاستوديو البصري',
  search: 'البحث الحي',
};

const KEY_PREFIX = 'ahsm';

export interface IssuedKey {
  record: PublicApiKey;
  /** المفتاح الكامل — يُعرض مرة وحدة بس */
  secret: string;
}

export type PublicApiKey = Omit<ApiKey, 'keyHash'>;

function toPublic(key: ApiKey): PublicApiKey {
  const { keyHash: _hash, ...rest } = key;
  return rest;
}

/** يصدر مفتاحًا جديدًا. */
export async function issueKey(name: string, scopes: Scope[]): Promise<IssuedKey> {
  const clean = name.trim();
  if (!clean) throw badRequest('اكتب اسم للمفتاح');

  const invalid = scopes.filter((scope) => !SCOPES.includes(scope));
  if (invalid.length > 0) throw badRequest(`صلاحيات غير معروفة: ${invalid.join(', ')}`);
  if (scopes.length === 0) throw badRequest('اختر صلاحية وحدة على الأقل');

  // البادئة معرّف عام قصير، والباقي هو السر
  const prefix = `${KEY_PREFIX}_${randomBytes(6).toString('hex')}`;
  const secretPart = randomBytes(32).toString('base64url');
  const secret = `${prefix}.${secretPart}`;

  const record = await prisma.apiKey.create({
    data: {
      name: clean.slice(0, 120),
      prefix,
      keyHash: await hashPassword(secretPart),
      scopes,
    },
  });

  return { record: toPublic(record), secret };
}

export async function listKeys(): Promise<PublicApiKey[]> {
  const keys = await prisma.apiKey.findMany({ orderBy: { createdAt: 'desc' } });
  return keys.map(toPublic);
}

export async function revokeKey(id: string): Promise<void> {
  const key = await prisma.apiKey.findUnique({ where: { id } });
  if (!key) throw notFound('ما لقينا هذا المفتاح');
  if (key.revokedAt) return;

  await prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
}

export async function deleteKey(id: string): Promise<void> {
  const key = await prisma.apiKey.findUnique({ where: { id } });
  if (!key) throw notFound('ما لقينا هذا المفتاح');
  await prisma.apiKey.delete({ where: { id } });
}

/** يفصل المفتاح لبادئة وسر. */
export function splitKey(raw: string): { prefix: string; secret: string } | null {
  const trimmed = raw.trim();
  const dot = trimmed.indexOf('.');
  if (dot <= 0 || dot === trimmed.length - 1) return null;

  const prefix = trimmed.slice(0, dot);
  const secret = trimmed.slice(dot + 1);
  if (!prefix.startsWith(`${KEY_PREFIX}_`)) return null;

  return { prefix, secret };
}

/** يتحقق من مفتاح ويرجّع صلاحياته، أو null إذا غير صالح. */
export async function verifyKey(raw: string): Promise<ApiKey | null> {
  const parts = splitKey(raw);
  if (!parts) return null;

  const key = await prisma.apiKey.findUnique({ where: { prefix: parts.prefix } });
  if (!key || key.revokedAt) return null;

  if (!(await verifyPassword(key.keyHash, parts.secret))) return null;

  // نحدّث آخر استخدام بحد أقصى مرة كل دقيقة
  if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > 60_000) {
    await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
  }

  return key;
}

export function hasScope(key: ApiKey, scope: Scope): boolean {
  return key.scopes.includes(scope);
}
