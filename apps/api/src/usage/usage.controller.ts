import { UsageService } from '@brain-dock/knowledge';
import { Role } from '@brain-dock/shared';
import { Controller, Get, Query } from '@nestjs/common';
import type { AuthenticatedUser } from '../common/auth-user';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { type AdminUsageQueryDto, adminUsageQuerySchema } from './usage.dto';
import { UsageAdminService } from './usage-admin.service';

/** Per-user MCP usage rollup (powers the VSCode extension's Token Savings panel). */
@Controller('usage')
export class UsageController {
  private readonly usage: UsageService;

  constructor(
    prisma: PrismaService,
    private readonly usageAdmin: UsageAdminService,
  ) {
    this.usage = new UsageService(prisma.client);
  }

  /** Platform-wide per-user rollup + summary — ADMIN and SUPER_ADMIN only. */
  @Roles(Role.ADMIN)
  @Get('admin')
  admin(@Query(new ZodValidationPipe(adminUsageQuerySchema)) query: AdminUsageQueryDto) {
    return this.usageAdmin.perUser(query.days, { take: query.take, skip: query.skip });
  }

  @Get()
  summary(@CurrentUser() user: AuthenticatedUser, @Query('days') days?: string) {
    const n = Math.min(Math.max(Number(days) || 30, 1), 365);
    return this.usage.summary(user.id, n);
  }
}
