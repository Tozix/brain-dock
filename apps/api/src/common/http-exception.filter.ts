import { Prisma } from '@brain-dock/db';
import { type ApiError, ErrorCode } from '@brain-dock/shared';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

// Minimal Express response surface (avoids depending on @types/express).
interface HttpResponse {
  status(code: number): HttpResponse;
  json(body: unknown): void;
}

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.VALIDATION,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHENTICATED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
  [HttpStatus.PAYLOAD_TOO_LARGE]: ErrorCode.VALIDATION,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.RATE_LIMITED,
};

function isApiErrorShape(value: unknown): value is ApiError {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ApiError).code === 'string' &&
    typeof (value as ApiError).message === 'string'
  );
}

/**
 * Normalizes every error to the canonical `{ code, message, details? }` envelope
 * (see @brain-dock/shared ApiError). Unknown errors never leak internals to the client.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HttpResponse>();
    const { status, body } = this.normalize(exception);
    response.status(status).json(body);
  }

  private normalize(exception: unknown): { status: number; body: ApiError } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      // Already in the canonical shape (e.g. ZodValidationPipe, RateLimitGuard) — pass through.
      if (isApiErrorShape(payload)) return { status, body: payload };

      const code =
        STATUS_TO_CODE[status] ?? (status >= 500 ? ErrorCode.INTERNAL : ErrorCode.VALIDATION);
      const message =
        typeof payload === 'string'
          ? payload
          : ((payload as { message?: string | string[] }).message ?? exception.message);
      return {
        status,
        body: { code, message: Array.isArray(message) ? message.join('; ') : message },
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // P2023: malformed identifier (e.g. non-UUID in a @db.Uuid column) — a client error.
      if (exception.code === 'P2023') {
        return {
          status: HttpStatus.BAD_REQUEST,
          body: { code: ErrorCode.VALIDATION, message: 'Malformed identifier' },
        };
      }
      // P2025: required record not found.
      if (exception.code === 'P2025') {
        return {
          status: HttpStatus.NOT_FOUND,
          body: { code: ErrorCode.NOT_FOUND, message: 'Record not found' },
        };
      }
    }

    // Unknown error: log server-side, return an opaque 500 (no stack/message leak).
    console.error('[HttpExceptionFilter] unhandled error:', exception);
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { code: ErrorCode.INTERNAL, message: 'Internal server error' },
    };
  }
}
