import { ErrorCode } from '@brain-dock/shared';
import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { FixedWindowLimiter } from './rate-limit';

/** Global fixed-window rate limit, keyed by authenticated user id or client IP. */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly limiter: FixedWindowLimiter;

  constructor(config: ConfigService) {
    this.limiter = new FixedWindowLimiter(
      config.env.RATE_LIMIT_MAX,
      config.env.RATE_LIMIT_WINDOW_MS,
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      user?: { id: string };
      ip?: string;
      socket?: { remoteAddress?: string };
    }>();
    const key = request.user?.id ?? request.ip ?? request.socket?.remoteAddress ?? 'anonymous';

    if (!this.limiter.hit(key, Date.now()).allowed) {
      throw new HttpException(
        { code: ErrorCode.RATE_LIMITED, message: 'Too many requests' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
