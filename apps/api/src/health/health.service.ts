import { Injectable } from '@nestjs/common';
import { RedisClient } from 'bun';
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
  qdrant: DependencyStatus;
  redis: DependencyStatus;
  /** Probed and gated only when EMBEDDER=ollama; otherwise reported as not-checked. */
  ollama: DependencyStatus | { checked: false };
}

const PROBE_TIMEOUT_MS = 2000;

/** Run a probe with a hard timeout so a hung dependency can't stall the readiness endpoint. */
async function timed(probe: () => Promise<void>): Promise<DependencyStatus> {
  const start = Date.now();
  try {
    await Promise.race([
      probe(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`timeout after ${PROBE_TIMEOUT_MS}ms`)),
          PROBE_TIMEOUT_MS,
        ),
      ),
    ]);
    return { up: true, latencyMs: Date.now() - start };
  } catch (error) {
    return { up: false, latencyMs: Date.now() - start, error: (error as Error).message };
  }
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Readiness — probes the critical dependencies concurrently. Ollama is gated only in ollama mode. */
  async readiness(): Promise<ReadinessReport> {
    const usesOllama = this.config.env.EMBEDDER === 'ollama';
    const [db, qdrant, redis, ollamaProbe] = await Promise.all([
      timed(() => this.checkDb()),
      timed(() => this.checkQdrant()),
      timed(() => this.checkRedis()),
      usesOllama ? timed(() => this.checkOllama()) : Promise.resolve(null),
    ]);
    const ollama: DependencyStatus | { checked: false } = ollamaProbe ?? { checked: false };
    const coreUp = db.up && qdrant.up && redis.up;
    const status = coreUp && (!usesOllama || (ollama as DependencyStatus).up) ? 'ok' : 'degraded';
    return { status, db, qdrant, redis, ollama };
  }

  private async checkDb(): Promise<void> {
    await this.prisma.client.$queryRaw`SELECT 1`;
  }

  private async checkQdrant(): Promise<void> {
    const res = await fetch(`${this.config.env.QDRANT_URL}/readyz`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`qdrant /readyz → ${res.status}`);
  }

  private async checkRedis(): Promise<void> {
    const client = new RedisClient(this.config.env.REDIS_URL);
    try {
      await client.ping();
    } finally {
      client.close();
    }
  }

  /** Ollama reachable AND the configured embedding model pulled. */
  private async checkOllama(): Promise<void> {
    const res = await fetch(`${this.config.env.OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`ollama /api/tags → ${res.status}`);
    const body = (await res.json()) as { models?: Array<{ name?: string }> };
    const model = this.config.env.EMBEDDING_MODEL;
    const pulled = (body.models ?? []).some((m) => (m.name ?? '').startsWith(model));
    if (!pulled) throw new Error(`embedding model "${model}" not pulled (ollama pull ${model})`);
  }
}
