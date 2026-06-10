import { z } from 'zod';

// The placeholder secrets shipped in .env.example — never acceptable in production.
const DEV_SECRETS = new Set([
  'dev-access-secret-change-me',
  'dev-refresh-secret-change-me',
  'change-me',
]);

/** Validated application environment. Parsed once at boot (see ConfigService). */
export const envSchema = z
  .object({
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

    // Express `trust proxy`: hop count or boolean. Required behind a reverse proxy so
    // `request.ip` (rate-limit key) reflects the real client instead of the proxy.
    TRUST_PROXY: z
      .union([
        z.coerce.number().int().min(0),
        z.enum(['true', 'false']).transform((v) => v === 'true'),
      ])
      .default(false),
    // When set, GET /metrics requires `Authorization: Bearer <token>`; unset keeps it open (dev).
    METRICS_TOKEN: z.string().min(1).optional(),
    // CSV allowlist of CORS origins. Empty (default) = CORS disabled.
    CORS_ORIGINS: z.string().default(''),
    // Upload-and-index: total byte budget for file contents in one request (default 50 MB).
    INDEX_UPLOAD_MAX_TOTAL_BYTES: z.coerce.number().int().positive().default(52_428_800),
    // Gate for reindexing by server-side filesystem path; resolved to a boolean below
    // (defaults: enabled outside production, disabled in production).
    INDEX_SERVER_PATHS: z.enum(['true', 'false']).optional(),

    // Tracing (opt-in). `none` keeps tracing off with no overhead; `console` prints spans
    // (debug); `otlp` exports to OTEL_EXPORTER_OTLP_ENDPOINT (e.g. http://localhost:4318/v1/traces).
    OTEL_TRACES_EXPORTER: z.enum(['none', 'console', 'otlp']).default('none'),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
    OTEL_SERVICE_NAME: z.string().default('brain-dock-api'),
  })
  // In production, reject the shipped dev secrets and require strong (≥32 char) JWT secrets.
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
      const value = env[key];
      if (DEV_SECRETS.has(value) || value.length < 32) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} must be a strong, non-default secret (≥32 chars) in production`,
        });
      }
    }
  })
  // Resolve env-dependent defaults: reading arbitrary server paths is a dev convenience,
  // so it stays off in production unless explicitly enabled.
  .transform((env) => ({
    ...env,
    INDEX_SERVER_PATHS:
      env.INDEX_SERVER_PATHS !== undefined
        ? env.INDEX_SERVER_PATHS === 'true'
        : env.NODE_ENV !== 'production',
  }));

export type Env = z.infer<typeof envSchema>;
