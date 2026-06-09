import {
  type CallHandler,
  type ExecutionContext,
  HttpException,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { SpanStatusCode } from '@opentelemetry/api';
import { type Observable, tap } from 'rxjs';
import { getTracer } from './tracing';

/**
 * Wraps each HTTP request in a span (method, route, status). When tracing is disabled the global
 * tracer is a no-op, so the started span does not record — overhead is negligible.
 */
@Injectable()
export class TracingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<{ method: string; route?: { path?: string }; path?: string }>();
    const response = http.getResponse<{ statusCode: number }>();
    const route = request.route?.path ?? request.path ?? 'unknown';

    const span = getTracer().startSpan(`${request.method} ${route}`, {
      attributes: { 'http.request.method': request.method, 'http.route': route },
    });

    return next.handle().pipe(
      tap({
        next: () => {
          span.setAttribute('http.response.status_code', response.statusCode);
          span.end();
        },
        error: (err: unknown) => {
          const status = err instanceof HttpException ? err.getStatus() : 500;
          span.setAttribute('http.response.status_code', status);
          span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
          span.end();
        },
      }),
    );
  }
}
