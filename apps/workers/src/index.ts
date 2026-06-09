/**
 * @brain-dock/workers — BullMQ workers entrypoint.
 * Phase 3: the IndexWorker (index → embed → Qdrant). More workers land later.
 */
import { initTracing, tracingOptionsFromEnv } from '@brain-dock/core';
import { createEmbedder, embedderConfigFromEnv } from '@brain-dock/embedding';
import { createIndexWorker } from './index-worker';

// Opt-in tracing (shared OTEL_* env; off by default). Init before the worker starts.
if (initTracing(tracingOptionsFromEnv('brain-dock-workers'))) {
  console.info(`[workers] tracing enabled (exporter: ${process.env.OTEL_TRACES_EXPORTER})`);
}

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:16379';
const qdrantUrl = process.env.QDRANT_URL ?? 'http://localhost:16333';

// Honor EMBEDDER (like api/mcp) so all writers to the same Qdrant collection agree on dimensions.
const embedder = createEmbedder(embedderConfigFromEnv());

const worker = createIndexWorker({ redisUrl, qdrantUrl, embedder });
worker.on('completed', (job, result) => {
  console.info(`[index] job ${job.id} done:`, result);
});
worker.on('failed', (job, err) => {
  console.error(`[index] job ${job?.id} failed:`, err.message);
});
console.info('[brain-dock:workers] index worker started');
