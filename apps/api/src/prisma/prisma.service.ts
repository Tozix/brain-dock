import { createPrismaClient, type PrismaClient } from '@brain-dock/db';
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '../config/config.service';

/**
 * Wraps a PrismaClient (pg adapter). Connection is lazy — the adapter connects on
 * first query — so the app boots even when the database is unavailable; readiness
 * probes surface DB status instead (see HealthService).
 */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly client: PrismaClient;

  constructor(config: ConfigService) {
    this.client = createPrismaClient(config.env.DATABASE_URL);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
