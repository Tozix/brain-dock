import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../common/decorators';
import { ApiKeysService } from './api-keys.service';

/**
 * Alternative authentication via `x-api-key` header. Not wired globally yet —
 * the MCP server (Phase 5) is the primary consumer; kept here for reuse.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly apiKeys: ApiKeysService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; apiKeyUserId?: string }>();
    const rawKey = request.headers['x-api-key'];
    if (!rawKey) throw new UnauthorizedException('Missing API key');

    const key = await this.apiKeys.resolveActive(rawKey);
    if (!key) throw new UnauthorizedException('Invalid or inactive API key');

    request.apiKeyUserId = key.userId;
    return true;
  }
}
