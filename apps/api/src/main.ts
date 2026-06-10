import 'reflect-metadata';
import { Logger, RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ConfigService } from './config/config.service';
import { initTracing, tracingOptionsFromEnv } from './tracing/tracing';

/** Loud, multi-line warnings for production configs that "work" but are unsafe/irrelevant. */
function warnOnRiskyProductionConfig(config: ConfigService): void {
  if (config.env.NODE_ENV !== 'production') return;

  if (config.env.EMBEDDER === 'deterministic') {
    console.warn(
      [
        '!'.repeat(72),
        '!! EMBEDDER=deterministic in production',
        '!! The deterministic embedder is a dev/offline stub: vectors carry NO',
        '!! semantic meaning, so search results will be IRRELEVANT.',
        '!! Set EMBEDDER=ollama (consistently across api/workers/mcp) and reindex.',
        '!'.repeat(72),
      ].join('\n'),
    );
  }

  try {
    const password = new URL(config.env.DATABASE_URL).password;
    if (['postgres', 'brain_dock', 'change-me', 'password'].includes(password)) {
      console.warn(
        [
          '!'.repeat(72),
          '!! DATABASE_URL uses a default password in production',
          `!! The Postgres password "${password}" is a well-known default.`,
          '!! Change it and update DATABASE_URL before exposing this deployment.',
          '!'.repeat(72),
        ].join('\n'),
      );
    }
  } catch {
    // DATABASE_URL is validated by Zod at boot; never fail on the warning path.
  }
}

async function bootstrap(): Promise<void> {
  // Opt-in tracing: initialized before the app so the global tracer exists when interceptors run.
  const traced = initTracing(tracingOptionsFromEnv('brain-dock-api'));

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  // Behind a reverse proxy, request.ip (rate-limit key) must come from X-Forwarded-For.
  app.set('trust proxy', config.env.TRUST_PROXY);

  // Minimal security headers without adding a helmet dependency.
  app.use(
    (_req: unknown, res: { setHeader(name: string, value: string): void }, next: () => void) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Referrer-Policy', 'no-referrer');
      next();
    },
  );

  // CORS stays disabled unless an explicit origin allowlist is configured.
  const corsOrigins = config.env.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (corsOrigins.length > 0) app.enableCors({ origin: corsOrigins });

  // Raise the JSON body limit: the VSCode extension uploads workspace file contents to be indexed.
  app.useBodyParser('json', { limit: '50mb' });

  // REST API is versioned under /api/v1; health probes stay at the root.
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
      { path: 'metrics', method: RequestMethod.GET },
    ],
  });
  app.enableShutdownHooks();

  warnOnRiskyProductionConfig(config);
  await app.listen(config.env.API_PORT, '0.0.0.0');

  const log = new Logger('Bootstrap');
  log.log(
    `brain-dock API listening on http://0.0.0.0:${config.env.API_PORT} (${config.env.NODE_ENV})`,
  );
  if (traced) log.log(`tracing enabled (exporter: ${config.env.OTEL_TRACES_EXPORTER})`);
}

void bootstrap();
