import { Injectable } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';

export interface DependencyStatus {
  up: boolean;
  latencyMs?: number;
  error?: string;
}

export interface ReadinessReport {
  status: 'ok' | 'degraded';
  db: DependencyStatus;
  /** Endpoints wired but not yet actively probed (added in later phases). */
  services: { redis: string; qdrant: string; ollama: string };
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async readiness(): Promise<ReadinessReport> {
    const db = await this.checkDb();
    return {
      status: db.up ? 'ok' : 'degraded',
      db,
      services: {
        redis: this.config.env.REDIS_URL,
        qdrant: this.config.env.QDRANT_URL,
        ollama: this.config.env.OLLAMA_URL,
      },
    };
  }

  private async checkDb(): Promise<DependencyStatus> {
    const start = Date.now();
    try {
      await this.prisma.client.$queryRaw`SELECT 1`;
      return { up: true, latencyMs: Date.now() - start };
    } catch (error) {
      return { up: false, error: (error as Error).message };
    }
  }
}
