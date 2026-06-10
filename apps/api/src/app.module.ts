import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { InMemoryRateLimiter, RATE_LIMITER, RedisRateLimiter } from './common/rate-limit';
import { RateLimitGuard } from './common/rate-limit.guard';
import { ConfigModule } from './config/config.module';
import { ConfigService } from './config/config.service';
import { HealthModule } from './health/health.module';
import { IndexingModule } from './indexing/indexing.module';
import { KnowledgeApiModule } from './knowledge/knowledge.module';
import { MetricsModule } from './metrics/metrics.module';
import { DocsModule } from './openapi/docs.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { RepositoriesModule } from './repositories/repositories.module';
import { TracingInterceptor } from './tracing/tracing.interceptor';
import { UsageModule } from './usage/usage.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuditModule,
    MetricsModule,
    AuthModule,
    ApiKeysModule,
    ProjectsModule,
    RepositoriesModule,
    IndexingModule,
    KnowledgeApiModule,
    UsageModule,
    DocsModule,
    HealthModule,
  ],
  providers: [
    {
      provide: RATE_LIMITER,
      useFactory: (config: ConfigService) =>
        config.env.RATE_LIMIT_BACKEND === 'redis'
          ? new RedisRateLimiter(
              config.env.REDIS_URL,
              config.env.RATE_LIMIT_MAX,
              config.env.RATE_LIMIT_WINDOW_MS,
            )
          : new InMemoryRateLimiter(config.env.RATE_LIMIT_MAX, config.env.RATE_LIMIT_WINDOW_MS),
      inject: [ConfigService],
    },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_INTERCEPTOR, useClass: TracingInterceptor },
    // Uniform error envelope: every error leaves as { code, message, details? }.
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
