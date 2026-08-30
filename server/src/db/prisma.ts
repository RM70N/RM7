import { PrismaClient } from '@prisma/client';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';

/**
 * عميل Prisma وحيد لكل العملية.
 * في وضع التطوير نحفظه على globalThis حتى لا يتضاعف مع كل إعادة تحميل.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.isDevelopment ? ['warn', 'error'] : ['error'],
  });

if (env.isDevelopment) {
  globalForPrisma.prisma = prisma;
}

/**
 * هل امتداد pgvector متوفّر ومفعّل؟
 * نخزّن الجواب لأنه ما يتغيّر أثناء تشغيل العملية.
 */
let vectorReady: boolean | null = null;

/**
 * pgvector اختياري: على السيرفرات الكاملة يشتغل البحث الدلالي،
 * وعلى الأجهزة اللي ما تقدر تركّبه (الجوال مثلًا) نكمل بالكلمات المفتاحية.
 * نتأكد من توفّره قبل ما نحاول ننشئه عشان ما نطلّع خطأ في السجل.
 */
export async function ensureVectorExtension(): Promise<boolean> {
  if (vectorReady !== null) return vectorReady;

  try {
    const rows = await prisma.$queryRaw<Array<{ available: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM pg_available_extensions WHERE name = 'vector'
      ) AS available
    `;

    if (rows[0]?.available !== true) {
      vectorReady = false;
      logger.warn('pgvector مو متوفّر — البحث الدلالي مطفي والاسترجاع بالكلمات المفتاحية.');
      return vectorReady;
    }

    await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector');
    vectorReady = true;
  } catch (error) {
    vectorReady = false;
    logger.warn('ما قدرنا نفعّل pgvector — نكمل بالكلمات المفتاحية.', error);
  }

  return vectorReady;
}

/** حالة pgvector بعد الاتصال (بدون استعلام جديد). */
export function isVectorEnabled(): boolean {
  return vectorReady === true;
}

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  await ensureVectorExtension();
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
