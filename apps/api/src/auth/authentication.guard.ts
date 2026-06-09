import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ApiKeysService } from '../api-keys/api-keys.service';
import type { AccessTokenPayload, AuthenticatedUser } from '../common/auth-user';
import { IS_PUBLIC_KEY } from '../common/decorators';
import { ConfigService } from '../config/config.service';

type AuthRequest = { headers: Record<string, string | undefined>; user?: AuthenticatedUser };

/**
 * Global authentication: accepts a Bearer JWT or an `x-api-key`, attaching the resolved principal
 * (id/email/role) to `request.user`. `@Public()` routes skip it. RolesGuard runs afterwards.
 */
@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly apiKeys: ApiKeysService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const bearer = request.headers.authorization ?? '';
    const apiKey = request.headers['x-api-key'];

    if (bearer.startsWith('Bearer ')) {
      request.user = await this.fromBearer(bearer.slice(7));
      return true;
    }
    if (apiKey) {
      const principal = await this.apiKeys.resolvePrincipal(apiKey);
      if (!principal) throw new UnauthorizedException('Invalid or inactive API key');
      request.user = principal;
      return true;
    }
    throw new UnauthorizedException('Missing bearer token or API key');
  }

  private async fromBearer(token: string): Promise<AuthenticatedUser> {
    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.env.JWT_ACCESS_SECRET,
      });
      return { id: payload.sub, email: payload.email, role: payload.role };
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
