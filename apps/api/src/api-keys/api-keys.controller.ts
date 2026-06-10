import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import type { AuthenticatedUser } from '../common/auth-user';
import { CurrentUser } from '../common/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  type IssueApiKeyDto,
  issueApiKeySchema,
  type ListApiKeysQueryDto,
  listApiKeysQuerySchema,
} from './api-keys.dto';
import { ApiKeysService } from './api-keys.service';

/** Self-service API keys: every user manages their own; ADMIN+ manages everyone's. */
@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  /** Issue a key for yourself; ADMIN+ may set `userId` (other user) and `rateLimit`. */
  @Post()
  issue(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(issueApiKeySchema)) dto: IssueApiKeyDto,
  ) {
    return this.apiKeys.issue(actor, dto);
  }

  /** List own keys; `?all=true` (ADMIN+) lists every key with the owner's email. */
  @Get()
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query(new ZodValidationPipe(listApiKeysQuerySchema)) query: ListApiKeysQueryDto,
  ) {
    return this.apiKeys.list(actor, { take: query.take, skip: query.skip }, query.all);
  }

  /** Revoke own key; ADMIN+ may revoke anyone's (foreign ids 404 for everyone else). */
  @Delete(':id')
  revoke(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.apiKeys.revoke(actor, id);
  }
}
