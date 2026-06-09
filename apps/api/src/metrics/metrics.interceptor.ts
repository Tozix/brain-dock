import {
  type CallHandler,
  type ExecutionContext,
  HttpException,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { type Observable, tap } from 'rxjs';
import { MetricsService } from './metrics.service';

/** Records HTTP request counters and durations for every handled request. */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<{ method: string; route?: { path?: string }; path?: string }>();
    const response = http.getResponse<{ statusCode: number }>();
    const start = Date.now();
    const route = () => request.route?.path ?? request.path ?? 'unknown';

    return next.handle().pipe(
      tap({
        next: () =>
          this.metrics.recordHttp(request.method, route(), response.statusCode, Date.now() - start),
        error: (err: unknown) => {
          const status = err instanceof HttpException ? err.getStatus() : 500;
          this.metrics.recordHttp(request.method, route(), status, Date.now() - start);
        },
      }),
    );
  }
}
