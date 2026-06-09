import { describe, expect, it } from 'bun:test';
import { Role } from '@brain-dock/shared';
import { UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedUser } from '../common/auth-user';
import { AuthenticationGuard } from './authentication.guard';

type Req = { headers: Record<string, string | undefined>; user?: AuthenticatedUser };

function ctx(req: Req) {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => undefined,
    getClass: () => undefined,
    // biome-ignore lint/suspicious/noExplicitAny: minimal ExecutionContext stub.
  } as any;
}

function makeGuard(opts: {
  isPublic?: boolean;
  jwtPayload?: { sub: string; email: string; role: Role };
  principal?: AuthenticatedUser | null;
}) {
  const jwt = {
    verifyAsync: async () => {
      if (!opts.jwtPayload) throw new Error('bad token');
      return opts.jwtPayload;
    },
  };
  const config = { env: { JWT_ACCESS_SECRET: 's' } };
  const apiKeys = { resolvePrincipal: async () => opts.principal ?? null };
  const reflector = { getAllAndOverride: () => opts.isPublic ?? false };
  // biome-ignore lint/suspicious/noExplicitAny: test doubles.
  return new AuthenticationGuard(jwt as any, config as any, apiKeys as any, reflector as any);
}

describe('AuthenticationGuard', () => {
  it('allows public routes without credentials', async () => {
    const guard = makeGuard({ isPublic: true });
    expect(await guard.canActivate(ctx({ headers: {} }))).toBe(true);
  });

  it('rejects requests with no credentials', async () => {
    const guard = makeGuard({});
    await expect(guard.canActivate(ctx({ headers: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('authenticates a valid Bearer token and attaches the principal', async () => {
    const guard = makeGuard({ jwtPayload: { sub: 'u1', email: 'u@x.io', role: Role.USER } });
    const req: Req = { headers: { authorization: 'Bearer good' } };
    expect(await guard.canActivate(ctx(req))).toBe(true);
    expect(req.user).toEqual({ id: 'u1', email: 'u@x.io', role: Role.USER });
  });

  it('authenticates via x-api-key and attaches the resolved principal', async () => {
    const principal: AuthenticatedUser = { id: 'k1', email: 'svc@x.io', role: Role.ADMIN };
    const guard = makeGuard({ principal });
    const req: Req = { headers: { 'x-api-key': 'bd_secret' } };
    expect(await guard.canActivate(ctx(req))).toBe(true);
    expect(req.user).toEqual(principal);
  });

  it('rejects an invalid API key', async () => {
    const guard = makeGuard({ principal: null });
    await expect(
      guard.canActivate(ctx({ headers: { 'x-api-key': 'nope' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
