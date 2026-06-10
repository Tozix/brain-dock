import { Role } from '@brain-dock/shared';
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import type { AuthenticatedUser } from '../common/auth-user';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/decorators';
import { type PaginationDto, paginationSchema } from '../common/pagination';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { type IssueApiKeyDto, issueApiKeySchema } from './api-keys.dto';
import { ApiKeysService } from './api-keys.service';

@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  /** Issue a new API key — Super Admin only (see Claude.md "API KEYS"). */
  @Roles(Role.SUPER_ADMIN)
  @Post()
  issue(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(issueApiKeySchema)) dto: IssueApiKeyDto,
  ) {
    return this.apiKeys.issue(actor, dto);
  }

  /** List the caller's own keys (secrets are never returned). */
  @Get()
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query(new ZodValidationPipe(paginationSchema)) page: PaginationDto,
  ) {
    return this.apiKeys.listForUser(actor.id, page);
  }

  @Roles(Role.SUPER_ADMIN)
  @Delete(':id')
  revoke(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.apiKeys.revoke(actor, id);
  }
}
