/**
 * @brain-dock/workers — BullMQ workers entrypoint.
 * Phase 3: the IndexWorker (index → embed → Qdrant). More workers land later.
 */
import { initTracing, tracingOptionsFromEnv } from '@brain-dock/core';
import { createPrismaClient } from '@brain-dock/db';
import { createEmbedder, embedderConfigFromEnv } from '@brain-dock/embedding';
import { SymbolIndexService } from '@brain-dock/knowledge';
import { createIndexWorker } from './index-worker';
import type { RepositoryStatusStore } from './process-index-job';

// Opt-in tracing (shared OTEL_* env; off by default). Init before the worker starts.
if (initTracing(tracingOptionsFromEnv('brain-dock-workers'))) {
  console.info(`[workers] tracing enabled (exporter: ${process.env.OTEL_TRACES_EXPORTER})`);
}

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:16379';
const qdrantUrl = process.env.QDRANT_URL ?? 'http://localhost:16333';

// Honor EMBEDDER (like api/mcp) so all writers to the same Qdrant collection agree on dimensions.
const embedder = createEmbedder(embedderConfigFromEnv());

// With a database, also persist the structural index (symbols/edges) for the hosted MCP.
const databaseUrl = process.env.DATABASE_URL;
const prisma = databaseUrl ? createPrismaClient(databaseUrl) : undefined;
const symbols = prisma ? new SymbolIndexService(prisma) : undefined;
if (symbols) console.info('[workers] symbol index persistence enabled');

// Stamp the indexing lifecycle (QUEUED→INDEXING→READY/FAILED) onto the Repository row.
const repositories: RepositoryStatusStore | undefined = prisma
  ? {
      updateStatus: async (repositoryId, patch) => {
        await prisma.repository.update({ where: { id: repositoryId }, data: patch });
      },
    }
  : undefined;

// Synchronous ts-morph parsing can block the event loop past BullMQ's default 30s lock;
// INDEX_LOCK_DURATION_MS overrides the 10-minute default for very large repositories.
const lockEnv = Number(process.env.INDEX_LOCK_DURATION_MS);
const lockDuration = Number.isFinite(lockEnv) && lockEnv > 0 ? lockEnv : undefined;

const worker = createIndexWorker({
  redisUrl,
  qdrantUrl,
  embedder,
  symbols,
  repositories,
  lockDuration,
});
worker.on('completed', (job, result) => {
  console.info(`[index] job ${job.id} done:`, result);
});
worker.on('failed', (job, err) => {
  const attempts = job ? `${job.attemptsMade}/${job.opts.attempts ?? 1}` : '?';
  console.error(`[index] job ${job?.id ?? '<unknown>'} failed (attempt ${attempts}):`, err);
});
console.info('[brain-dock:workers] index worker started');

// Graceful shutdown: finish the active job, then release Redis and Postgres connections.
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`[workers] ${signal} received — closing worker (waiting for active jobs)`);
  try {
    await worker.close(); // waits for the active job and closes BullMQ's Redis connections
    await prisma?.$disconnect();
  } catch (error) {
    console.error('[workers] shutdown error:', error);
    process.exit(1);
  }
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
