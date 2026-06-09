import 'reflect-metadata';
import { Logger, RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from './config/config.service';
import { initTracing, tracingOptionsFromEnv } from './tracing/tracing';

async function bootstrap(): Promise<void> {
  // Opt-in tracing: initialized before the app so the global tracer exists when interceptors run.
  const traced = initTracing(tracingOptionsFromEnv('brain-dock-api'));

  const app = await NestFactory.create(AppModule);

  // REST API is versioned under /api/v1; health probes stay at the root.
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
      { path: 'metrics', method: RequestMethod.GET },
    ],
  });
  app.enableShutdownHooks();

  const config = app.get(ConfigService);
  await app.listen(config.env.API_PORT, '0.0.0.0');

  const log = new Logger('Bootstrap');
  log.log(
    `brain-dock API listening on http://0.0.0.0:${config.env.API_PORT} (${config.env.NODE_ENV})`,
  );
  if (traced) log.log(`tracing enabled (exporter: ${config.env.OTEL_TRACES_EXPORTER})`);
}

void bootstrap();
