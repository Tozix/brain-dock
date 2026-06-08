import { afterEach, describe, expect, it } from 'bun:test';
import { OllamaEmbeddingProvider } from './ollama-provider';

const realFetch = globalThis.fetch;

describe('OllamaEmbeddingProvider', () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('posts batched requests to /api/embed and concatenates embeddings', async () => {
    const calls: Array<{ url: string; input: string[] }> = [];
    globalThis.fetch = (async (url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { input: string[] };
      calls.push({ url: String(url), input: body.input });
      return new Response(JSON.stringify({ embeddings: body.input.map(() => [0.1, 0.2]) }), {
        status: 200,
      });
    }) as unknown as typeof fetch;

    const provider = new OllamaEmbeddingProvider({
      url: 'http://ollama',
      model: 'nomic-embed-text',
      dimensions: 2,
      batchSize: 2,
    });
    const out = await provider.embed(['a', 'b', 'c']);

    expect(out).toHaveLength(3);
    expect(calls).toHaveLength(2); // 3 inputs, batchSize 2 → 2 requests
    expect(calls[0]?.url).toContain('/api/embed');
    expect(provider.model).toBe('nomic-embed-text');
    expect(provider.dimensions).toBe(2);
  });

  it('throws a descriptive error on a non-ok response', async () => {
    globalThis.fetch = (async () =>
      new Response('model not found', { status: 404 })) as unknown as typeof fetch;
    const provider = new OllamaEmbeddingProvider({
      url: 'http://ollama',
      model: 'm',
      dimensions: 2,
    });
    await expect(provider.embed(['x'])).rejects.toThrow(/404/);
  });
});
