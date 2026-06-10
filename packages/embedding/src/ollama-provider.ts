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
  /** Per-request timeout in milliseconds (default 60 000). */
  timeoutMs?: number;
}

interface EmbedResponse {
  embeddings: number[][];
}

const DEFAULT_TIMEOUT_MS = 60_000;

/** Embeddings via the local Ollama HTTP API (`POST /api/embed`). */
export class OllamaEmbeddingProvider implements EmbeddingProvider {
  private readonly batchSize: number;
  private readonly maxChars: number;
  private readonly timeoutMs: number;

  constructor(private readonly options: OllamaProviderOptions) {
    this.batchSize = options.batchSize ?? 64;
    this.maxChars = options.maxChars ?? 6000;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
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
      const response = await this.post(input);
      if (!response.ok) {
        throw new Error(`Ollama embed failed (${response.status}): ${await response.text()}`);
      }
      const data = (await response.json()) as EmbedResponse;
      if (!Array.isArray(data.embeddings) || data.embeddings.length !== input.length) {
        throw new Error(
          `Ollama embed returned ${data.embeddings?.length ?? 0} embeddings for ` +
            `${input.length} inputs (model ${this.options.model})`,
        );
      }
      out.push(...data.embeddings);
    }
    return out;
  }

  private async post(input: string[]): Promise<Response> {
    try {
      return await fetch(`${this.options.url}/api/embed`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: this.options.model, input }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      // No external signal is passed in, so any abort here is our own timeout firing.
      if (
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError')
      ) {
        throw new Error(
          `Ollama embed timed out after ${this.timeoutMs}ms (${this.options.url}) — ` +
            'is Ollama running and the model loaded?',
        );
      }
      throw error;
    }
  }
}
