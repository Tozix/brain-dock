import type { EmbeddingProvider } from './provider';

export interface OllamaProviderOptions {
  url: string;
  model: string;
  /** Dimensionality of the model output (nomic-embed-text = 768). */
  dimensions: number;
  /** Max texts per HTTP request. */
  batchSize?: number;
  /**
   * Max characters per input. Longer texts are truncated so a single large symbol/chunk doesn't
   * exceed the model's context window (nomic-embed-text ≈ 2048 tokens) and fail the whole batch.
   */
  maxChars?: number;
}

interface EmbedResponse {
  embeddings: number[][];
}

/** Embeddings via the local Ollama HTTP API (`POST /api/embed`). */
export class OllamaEmbeddingProvider implements EmbeddingProvider {
  private readonly batchSize: number;
  private readonly maxChars: number;

  constructor(private readonly options: OllamaProviderOptions) {
    this.batchSize = options.batchSize ?? 64;
    this.maxChars = options.maxChars ?? 6000;
  }

  get model(): string {
    return this.options.model;
  }

  get dimensions(): number {
    return this.options.dimensions;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const input = texts
        .slice(i, i + this.batchSize)
        .map((t) => (t.length > this.maxChars ? t.slice(0, this.maxChars) : t));
      const response = await fetch(`${this.options.url}/api/embed`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: this.options.model, input }),
      });
      if (!response.ok) {
        throw new Error(`Ollama embed failed (${response.status}): ${await response.text()}`);
      }
      const data = (await response.json()) as EmbedResponse;
      out.push(...data.embeddings);
    }
    return out;
  }
}
