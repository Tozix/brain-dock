import { describe, expect, it } from 'bun:test';
import { ConfigService } from './config.service';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  QDRANT_URL: 'http://localhost:6333',
  OLLAMA_URL: 'http://localhost:11434',
  JWT_ACCESS_SECRET: 'access-secret',
  JWT_REFRESH_SECRET: 'refresh-secret',
} as NodeJS.ProcessEnv;

describe('ConfigService.parse', () => {
  it('applies documented defaults', () => {
    const env = ConfigService.parse(base);
    expect(env.NODE_ENV).toBe('development');
    expect(env.API_PORT).toBe(3000);
    expect(env.EMBEDDING_MODEL).toBe('nomic-embed-text');
  });

  it('coerces API_PORT from a string', () => {
    const env = ConfigService.parse({ ...base, API_PORT: '8080' } as NodeJS.ProcessEnv);
    expect(env.API_PORT).toBe(8080);
  });

  it('throws on missing required variables', () => {
    expect(() => ConfigService.parse({} as NodeJS.ProcessEnv)).toThrow();
  });

  it('throws on an invalid URL', () => {
    expect(() =>
      ConfigService.parse({ ...base, DATABASE_URL: 'not-a-url' } as NodeJS.ProcessEnv),
    ).toThrow();
  });
});
