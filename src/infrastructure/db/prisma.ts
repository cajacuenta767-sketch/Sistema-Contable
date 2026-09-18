import { PrismaClient } from '@prisma/client'

/**
 * Cliente de Prisma como singleton.
 *
 * En desarrollo, el hot-reload de Next.js reevalua los modulos en cada cambio.
 * Sin este cache global se abre un pool de conexiones nuevo cada vez y Postgres
 * termina rechazando conexiones ("too many clients"). Es el bug numero uno de
 * Prisma + Next.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
