import { describe, expect, it } from 'bun:test';
import { credentialsSchema, refreshSchema } from './auth.dto';

describe('credentialsSchema', () => {
  it('accepts a valid email and password', () => {
    const result = credentialsSchema.safeParse({
      email: 'admin@brain.dock',
      password: 'longenough',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a malformed email and a too-short password', () => {
    const result = credentialsSchema.safeParse({ email: 'nope', password: '1' });
    expect(result.success).toBe(false);
  });
});

describe('refreshSchema', () => {
  it('requires a non-trivial refresh token', () => {
    expect(refreshSchema.safeParse({ refreshToken: 'short' }).success).toBe(false);
    expect(refreshSchema.safeParse({ refreshToken: 'x'.repeat(20) }).success).toBe(true);
  });
});
