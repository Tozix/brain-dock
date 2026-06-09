import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { RateLimitGuard } from './common/rate-limit.guard';
import { ConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { KnowledgeApiModule } from './knowledge/knowledge.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuditModule,
    AuthModule,
    ApiKeysModule,
    ProjectsModule,
    KnowledgeApiModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: RateLimitGuard }],
})
export class AppModule {}
