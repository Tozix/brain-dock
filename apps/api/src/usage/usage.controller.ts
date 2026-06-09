import { UsageService } from '@brain-dock/knowledge';
import { Controller, Get, Query } from '@nestjs/common';
import type { AuthenticatedUser } from '../common/auth-user';
import { CurrentUser } from '../common/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

/** Per-user MCP usage rollup (powers the VSCode extension's Token Savings panel). */
@Controller('usage')
export class UsageController {
  private readonly usage: UsageService;

  constructor(prisma: PrismaService) {
    this.usage = new UsageService(prisma.client);
  }

  @Get()
  summary(@CurrentUser() user: AuthenticatedUser, @Query('days') days?: string) {
    const n = Math.min(Math.max(Number(days) || 30, 1), 365);
    return this.usage.summary(user.id, n);
  }
}
