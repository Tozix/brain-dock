import {
  DeterministicEmbeddingProvider,
  type EmbeddingProvider,
  OllamaEmbeddingProvider,
} from '@brain-dock/embedding';
import type { Env } from '../config/env.schema';

/** Build the embedding provider from config (must match other writers to the same collections). */
export function makeEmbedder(env: Env): EmbeddingProvider {
  return env.EMBEDDER === 'ollama'
    ? new OllamaEmbeddingProvider({
        url: env.OLLAMA_URL,
        model: env.EMBEDDING_MODEL,
        dimensions: 768,
      })
    : new DeterministicEmbeddingProvider(256);
}
