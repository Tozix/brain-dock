import { describe, expect, it } from 'bun:test';
import { createEmbedder, embedderConfigFromEnv } from './factory';

describe('createEmbedder', () => {
  it('builds a 256-dim deterministic provider by default', () => {
    expect(createEmbedder({ provider: 'deterministic' }).dimensions).toBe(256);
  });

  it('builds a 768-dim Ollama provider', () => {
    const e = createEmbedder({ provider: 'ollama', ollamaUrl: 'http://x:1', model: 'm' });
    expect(e.dimensions).toBe(768);
  });
});

describe('embedderConfigFromEnv', () => {
  it('defaults to deterministic, ollama only when EMBEDDER=ollama', () => {
    expect(embedderConfigFromEnv({}).provider).toBe('deterministic');
    expect(embedderConfigFromEnv({ EMBEDDER: 'whatever' }).provider).toBe('deterministic');
    expect(embedderConfigFromEnv({ EMBEDDER: 'ollama' }).provider).toBe('ollama');
  });

  it('passes ollama url and model through', () => {
    const c = embedderConfigFromEnv({
      EMBEDDER: 'ollama',
      OLLAMA_URL: 'http://h:2',
      EMBEDDING_MODEL: 'bge',
    });
    expect(c).toEqual({ provider: 'ollama', ollamaUrl: 'http://h:2', model: 'bge' });
  });
});
