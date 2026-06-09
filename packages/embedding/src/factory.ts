import { DeterministicEmbeddingProvider } from './deterministic-provider';
import { OllamaEmbeddingProvider } from './ollama-provider';
import type { EmbeddingProvider } from './provider';

/** Ollama embedding dimensions (nomic-embed-text); deterministic uses a smaller offline vector. */
const OLLAMA_DIMENSIONS = 768;
const DETERMINISTIC_DIMENSIONS = 256;

export interface EmbedderConfig {
  provider: 'ollama' | 'deterministic';
  ollamaUrl?: string;
  model?: string;
}

/**
 * Build the embedding provider. MUST be used consistently across api/mcp/workers: they write to
 * the same Qdrant collections, so a provider/dimension mismatch corrupts the index.
 */
export function createEmbedder(config: EmbedderConfig): EmbeddingProvider {
  return config.provider === 'ollama'
    ? new OllamaEmbeddingProvider({
        url: config.ollamaUrl ?? 'http://localhost:11434',
        model: config.model ?? 'nomic-embed-text',
        dimensions: OLLAMA_DIMENSIONS,
      })
    : new DeterministicEmbeddingProvider(DETERMINISTIC_DIMENSIONS);
}

/** Resolve embedder config from environment (`EMBEDDER`, `OLLAMA_URL`, `EMBEDDING_MODEL`). */
export function embedderConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): EmbedderConfig {
  return {
    provider: env.EMBEDDER === 'ollama' ? 'ollama' : 'deterministic',
    ollamaUrl: env.OLLAMA_URL,
    model: env.EMBEDDING_MODEL,
  };
}
