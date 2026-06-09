import { createEmbedder, type EmbeddingProvider } from '@brain-dock/embedding';
import type { Env } from '../config/env.schema';

/** Build the embedding provider from config (must match other writers to the same collections). */
export function makeEmbedder(env: Env): EmbeddingProvider {
  return createEmbedder({
    provider: env.EMBEDDER,
    ollamaUrl: env.OLLAMA_URL,
    model: env.EMBEDDING_MODEL,
  });
}
