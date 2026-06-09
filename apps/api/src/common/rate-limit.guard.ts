import { ErrorCode } from '@brain-dock/shared';
import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { MetricsService } from '../metrics/metrics.service';
import { RATE_LIMITER, type RateLimiter } from './rate-limit';

/** Global rate limit, keyed by authenticated user id or client IP. Backend is pluggable. */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
    private readonly metrics: MetricsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: { id: string };
      ip?: string;
      socket?: { remoteAddress?: string };
    }>();
    const key = request.user?.id ?? request.ip ?? request.socket?.remoteAddress ?? 'anonymous';

    const decision = await this.limiter.hit(key, Date.now());
    if (!decision.allowed) {
      this.metrics.incCounter('rate_limit_blocked_total');
      throw new HttpException(
        { code: ErrorCode.RATE_LIMITED, message: 'Too many requests' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
