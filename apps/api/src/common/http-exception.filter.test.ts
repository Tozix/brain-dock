import { describe, expect, it, spyOn } from 'bun:test';
import { Prisma } from '@brain-dock/db';
import { ErrorCode } from '@brain-dock/shared';
import { type ArgumentsHost, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

/** Runs the filter against a minimal ArgumentsHost/Response double and captures the reply. */
function run(exception: unknown) {
  const sent: { status?: number; body?: unknown } = {};
  const response = {
    status(code: number) {
      sent.status = code;
      return response;
    },
    json(body: unknown) {
      sent.body = body;
    },
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  new HttpExceptionFilter().catch(exception, host);
  return sent;
}

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('db says no', { code, clientVersion: 'test' });

describe('HttpExceptionFilter', () => {
  it('maps an HttpException to the canonical { code, message } envelope', () => {
    const sent = run(new NotFoundException('Project not found'));
    expect(sent.status).toBe(HttpStatus.NOT_FOUND);
    expect(sent.body).toEqual({ code: ErrorCode.NOT_FOUND, message: 'Project not found' });
  });

  it('passes an already-canonical payload through unchanged (details preserved)', () => {
    const payload = {
      code: ErrorCode.VALIDATION,
      message: 'bad input',
      details: { field: 'slug' },
    };
    const sent = run(new HttpException(payload, HttpStatus.BAD_REQUEST));
    expect(sent.status).toBe(HttpStatus.BAD_REQUEST);
    expect(sent.body).toEqual(payload);
  });

  it('joins array messages from Nest validation payloads', () => {
    const sent = run(
      new HttpException({ message: ['a is bad', 'b is bad'] }, HttpStatus.BAD_REQUEST),
    );
    expect(sent.body).toEqual({ code: ErrorCode.VALIDATION, message: 'a is bad; b is bad' });
  });

  it('returns an opaque 500 for unknown errors without leaking the original message', () => {
    const errorSpy = spyOn(console, 'error').mockImplementation(() => {});
    try {
      const sent = run(new Error('postgres://user:hunter2@db/prod exploded'));
      expect(sent.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(sent.body).toEqual({ code: ErrorCode.INTERNAL, message: 'Internal server error' });
      expect(JSON.stringify(sent.body)).not.toContain('hunter2');
      expect(errorSpy).toHaveBeenCalledTimes(1); // logged server-side
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('maps Prisma P2023 (malformed identifier) to 400 VALIDATION', () => {
    const sent = run(prismaError('P2023'));
    expect(sent.status).toBe(HttpStatus.BAD_REQUEST);
    expect(sent.body).toEqual({ code: ErrorCode.VALIDATION, message: 'Malformed identifier' });
  });

  it('maps Prisma P2025 (record not found) to 404 NOT_FOUND', () => {
    const sent = run(prismaError('P2025'));
    expect(sent.status).toBe(HttpStatus.NOT_FOUND);
    expect(sent.body).toEqual({ code: ErrorCode.NOT_FOUND, message: 'Record not found' });
  });

  it('falls back to INTERNAL for 5xx HttpExceptions with no status mapping', () => {
    const errorSpy = spyOn(console, 'error').mockImplementation(() => {});
    try {
      const sent = run(new HttpException('upstream broke', HttpStatus.BAD_GATEWAY));
      expect(sent.status).toBe(HttpStatus.BAD_GATEWAY);
      expect(sent.body).toEqual({ code: ErrorCode.INTERNAL, message: 'upstream broke' });
    } finally {
      errorSpy.mockRestore();
    }
  });
});
