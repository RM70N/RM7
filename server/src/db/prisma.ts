import { PrismaClient } from '@prisma/client';
import { env } from '../lib/env.js';

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

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector');
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
