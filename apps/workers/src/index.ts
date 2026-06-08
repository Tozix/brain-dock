/**
 * @brain-dock/workers — BullMQ workers entrypoint.
 * Phase 3: the IndexWorker (index → embed → Qdrant). More workers land later.
 */
import { OllamaEmbeddingProvider } from '@brain-dock/embedding';
import { createIndexWorker } from './index-worker';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:16379';
const qdrantUrl = process.env.QDRANT_URL ?? 'http://localhost:16333';

const embedder = new OllamaEmbeddingProvider({
  url: process.env.OLLAMA_URL ?? 'http://localhost:11434',
  model: process.env.EMBEDDING_MODEL ?? 'nomic-embed-text',
  dimensions: 768,
});

const worker = createIndexWorker({ redisUrl, qdrantUrl, embedder });
worker.on('completed', (job, result) => {
  console.info(`[index] job ${job.id} done:`, result);
});
worker.on('failed', (job, err) => {
  console.error(`[index] job ${job?.id} failed:`, err.message);
});
console.info('[brain-dock:workers] index worker started');
