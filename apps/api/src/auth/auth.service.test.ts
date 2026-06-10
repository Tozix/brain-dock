import { describe, expect, it } from 'bun:test';
import { Role } from '@brain-dock/shared';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';

type UserRow = {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  isActive: boolean;
};

/** Minimal in-memory Prisma double for the `user` model. */
function fakePrisma(seed: UserRow[] = []) {
  const rows = [...seed];
  let seq = seed.length;
  return {
    rows,
    client: {
      user: {
        findUnique: async ({ where }: { where: { email?: string; id?: string } }) =>
          rows.find((r) => (where.email ? r.email === where.email : r.id === where.id)) ?? null,
        count: async () => rows.length,
        create: async ({ data }: { data: { email: string; passwordHash: string; role: Role } }) => {
          const row: UserRow = { id: `u${++seq}`, isActive: true, ...data };
          rows.push(row);
          return row;
        },
      },
    },
  };
}

const audit = { log: async () => {} };

const config = {
  env: {
    JWT_ACCESS_SECRET: 'test-access-secret-0123456789abcdef-0123',
    JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789abcdef-012',
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '7d',
  },
};

// Real JwtService — secrets are passed per call, so no module-level options are needed.
const jwt = new JwtService({});

const make = (prisma: ReturnType<typeof fakePrisma>) =>
  // biome-ignore lint/suspicious/noExplicitAny: test doubles intentionally narrow the real types.
  new AuthService(prisma as any, jwt, config as any, audit as any);

async function seedUser(overrides: Partial<UserRow> = {}): Promise<UserRow> {
  return {
    id: 'u1',
    email: 'u@x.io',
    passwordHash: await Bun.password.hash('correct-horse'),
    role: Role.USER,
    isActive: true,
    ...overrides,
  };
}

describe('AuthService.register', () => {
  it('bootstraps the very first user as SUPER_ADMIN', async () => {
    const prisma = fakePrisma();
    const service = make(prisma);
    const result = await service.register({ email: 'first@x.io', password: 'secret-password' });
    expect(result.user.role).toBe(Role.SUPER_ADMIN);
    expect(prisma.rows[0]?.role).toBe(Role.SUPER_ADMIN);
    // Tokens are verifiable with the configured secrets and carry the user id.
    const payload = await jwt.verifyAsync<{ sub: string }>(result.accessToken, {
      secret: config.env.JWT_ACCESS_SECRET,
    });
    expect(payload.sub).toBe(result.user.id);
  });

  it('registers every subsequent user as plain USER', async () => {
    const prisma = fakePrisma([await seedUser()]);
    const service = make(prisma);
    const result = await service.register({ email: 'second@x.io', password: 'secret-password' });
    expect(result.user.role).toBe(Role.USER);
  });

  it('rejects an already registered email with Conflict', async () => {
    const prisma = fakePrisma([await seedUser()]);
    const service = make(prisma);
    await expect(
      service.register({ email: 'u@x.io', password: 'secret-password' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('AuthService.login', () => {
  it('rejects a deactivated user even with the correct password', async () => {
    const prisma = fakePrisma([await seedUser({ isActive: false })]);
    const service = make(prisma);
    await expect(
      service.login({ email: 'u@x.io', password: 'correct-horse' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a wrong password', async () => {
    const prisma = fakePrisma([await seedUser()]);
    const service = make(prisma);
    await expect(service.login({ email: 'u@x.io', password: 'wrong' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('returns tokens for an active user with the correct password', async () => {
    const prisma = fakePrisma([await seedUser()]);
    const service = make(prisma);
    const result = await service.login({ email: 'u@x.io', password: 'correct-horse' });
    expect(result.user).toEqual({ id: 'u1', email: 'u@x.io', role: Role.USER });
    expect(result.accessToken).not.toBe(result.refreshToken);
  });
});

describe('AuthService.refresh', () => {
  it('rejects a malformed token', async () => {
    const service = make(fakePrisma([await seedUser()]));
    await expect(service.refresh('not-a-jwt')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token signed with the wrong secret', async () => {
    const service = make(fakePrisma([await seedUser()]));
    const forged = await jwt.signAsync(
      { sub: 'u1' },
      { secret: 'attacker-controlled-secret-32-chars!!' },
    );
    await expect(service.refresh(forged)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an expired token', async () => {
    const service = make(fakePrisma([await seedUser()]));
    const expired = await jwt.signAsync(
      { sub: 'u1', exp: Math.floor(Date.now() / 1000) - 60 },
      { secret: config.env.JWT_REFRESH_SECRET },
    );
    await expect(service.refresh(expired)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a valid token whose user has been deactivated', async () => {
    const service = make(fakePrisma([await seedUser({ isActive: false })]));
    const token = await jwt.signAsync(
      { sub: 'u1' },
      { secret: config.env.JWT_REFRESH_SECRET, expiresIn: '7d' },
    );
    await expect(service.refresh(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('issues fresh tokens for a valid refresh token of an active user', async () => {
    const service = make(fakePrisma([await seedUser()]));
    const token = await jwt.signAsync(
      { sub: 'u1' },
      { secret: config.env.JWT_REFRESH_SECRET, expiresIn: '7d' },
    );
    const result = await service.refresh(token);
    expect(result.user).toEqual({ id: 'u1', email: 'u@x.io', role: Role.USER });
  });
});
