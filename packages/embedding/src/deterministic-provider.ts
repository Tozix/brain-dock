import type { EmbeddingProvider } from './provider';

/**
 * Offline, dependency-free embedding provider: a hashed bag-of-tokens vector,
 * L2-normalized. Deterministic and lexically meaningful — used in tests and for
 * verifying the full ingest→store→search pipeline without downloading a model.
 * NOT for production retrieval quality.
 */
export class DeterministicEmbeddingProvider implements EmbeddingProvider {
  readonly model = 'deterministic-hash-v1';

  constructor(readonly dimensions = 256) {}

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.vectorize(text));
  }

  private vectorize(text: string): number[] {
    const vector = new Array<number>(this.dimensions).fill(0);
    const tokens = text.toLowerCase().match(/[a-z0-9_]+/g) ?? [];
    for (const token of tokens) {
      const idx = fnv1a(token) % this.dimensions;
      vector[idx] = (vector[idx] ?? 0) + 1;
    }
    const norm = Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0)) || 1;
    return vector.map((x) => x / norm);
  }
}

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
