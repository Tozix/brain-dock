/**
 * Local embedding provider. All embeddings run locally (Ollama by default);
 * the interface lets us swap models/providers (bge, mxbai, …) — see Claude.md §14.
 */
export interface EmbeddingProvider {
  /** Stable model identifier, stored alongside vectors for versioning. */
  readonly model: string;
  /** Vector dimensionality — must match the Qdrant collection size. */
  readonly dimensions: number;
  /** Embed a batch of texts; result[i] corresponds to texts[i]. */
  embed(texts: string[]): Promise<number[][]>;
}
