/**
 * Local embedding provider. All embeddings run locally (Ollama by default);
 * the interface lets us swap models/providers (bge, mxbai, …) — see Claude.md §14.
 */
export interface EmbeddingProvider {
  /** Stable model identifier, stored alongside vectors for versioning. */
  readonly model: string;
  /** Vector dimensionality — must match the Qdrant collection size. */
  readonly dimensions: number;
  /**
   * Embed a batch of **documents** (indexing side); result[i] corresponds to texts[i].
   * Asymmetric retrieval models (nomic-embed-text) apply a `search_document: ` task prefix.
   */
  embed(texts: string[]): Promise<number[][]>;
  /**
   * Embed a **search query** (retrieval side). Asymmetric retrieval models apply a
   * `search_query: ` task prefix; symmetric providers may delegate to {@link embed}.
   */
  embedQuery(text: string): Promise<number[]>;
}
