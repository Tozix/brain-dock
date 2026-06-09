import { z } from 'zod';

/** Validated application environment. Parsed once at boot (see ConfigService). */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  QDRANT_URL: z.url(),
  OLLAMA_URL: z.url(),
  EMBEDDING_MODEL: z.string().min(1).default('nomic-embed-text'),
  // Embedding provider — must match across API/MCP/workers writing to the same collections.
  EMBEDDER: z.enum(['ollama', 'deterministic']).default('deterministic'),

  JWT_ACCESS_SECRET: z.string().min(8),
  JWT_REFRESH_SECRET: z.string().min(8),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),

  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  // `redis` shares limits across instances (uses REDIS_URL); `memory` is per-process.
  RATE_LIMIT_BACKEND: z.enum(['memory', 'redis']).default('memory'),

  // Tracing (opt-in). `none` keeps tracing off with no overhead; `console` prints spans
  // (debug); `otlp` exports to OTEL_EXPORTER_OTLP_ENDPOINT (e.g. http://localhost:4318/v1/traces).
  OTEL_TRACES_EXPORTER: z.enum(['none', 'console', 'otlp']).default('none'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  OTEL_SERVICE_NAME: z.string().default('brain-dock-api'),
});

export type Env = z.infer<typeof envSchema>;
