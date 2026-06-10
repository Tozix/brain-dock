import { describe, expect, it } from 'bun:test';
import { DeterministicEmbeddingProvider } from './deterministic-provider';

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += (a[i] ?? 0) * (b[i] ?? 0);
  return dot; // inputs are already L2-normalized
}

describe('DeterministicEmbeddingProvider', () => {
  const provider = new DeterministicEmbeddingProvider(128);

  it('is deterministic and respects the configured dimensionality', async () => {
    const [a] = await provider.embed(['authentication service jwt']);
    const [b] = await provider.embed(['authentication service jwt']);
    expect(a).toEqual(b);
    expect(a).toHaveLength(128);
  });

  it('produces unit-length vectors', async () => {
    const [v] = await provider.embed(['hello world hello']);
    const norm = Math.sqrt((v ?? []).reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it('embedQuery matches embed exactly (symmetric, no task prefixes)', async () => {
    const [doc] = await provider.embed(['authentication service jwt']);
    const query = await provider.embedQuery('authentication service jwt');
    expect(query).toEqual(doc ?? []);
  });

  it('ranks lexically similar text higher than unrelated text', async () => {
    const [query, related, unrelated] = await provider.embed([
      'jwt authentication token refresh',
      'the auth service issues a jwt token and a refresh token',
      'qdrant vector collection cosine distance',
    ]);
    expect(cosine(query ?? [], related ?? [])).toBeGreaterThan(
      cosine(query ?? [], unrelated ?? []),
    );
  });
});
