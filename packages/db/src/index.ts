import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client';

export * from './generated/client';

/**
 * Builds a PrismaClient backed by the pg driver adapter (Prisma 7 + Bun runtime).
 * Connection URL comes from config, not from schema.prisma (see prisma.config.ts).
 */
export function createPrismaClient(connectionString: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}
