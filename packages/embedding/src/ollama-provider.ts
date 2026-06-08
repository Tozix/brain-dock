import type { EmbeddingProvider } from './provider';

export interface OllamaProviderOptions {
  url: string;
  model: string;
  /** Dimensionality of the model output (nomic-embed-text = 768). */
  dimensions: number;
  /** Max texts per HTTP request. */
  batchSize?: number;
}

interface EmbedResponse {
  embeddings: number[][];
}

/** Embeddings via the local Ollama HTTP API (`POST /api/embed`). */
export class OllamaEmbeddingProvider implements EmbeddingProvider {
  private readonly batchSize: number;

  constructor(private readonly options: OllamaProviderOptions) {
    this.batchSize = options.batchSize ?? 64;
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
      const input = texts.slice(i, i + this.batchSize);
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
