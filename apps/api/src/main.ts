import 'reflect-metadata';
import { Logger, RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from './config/config.service';

async function bootstrap(): Promise<void> {
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

  new Logger('Bootstrap').log(
    `brain-dock API listening on http://0.0.0.0:${config.env.API_PORT} (${config.env.NODE_ENV})`,
  );
}

void bootstrap();
