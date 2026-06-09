import { describe, expect, it } from 'bun:test';
import { resolveProject, resolveUser } from './auth';

type Key = {
  id: string;
  userId: string;
  status: string;
  expiresAt: Date | null;
};

/** Fake prisma returning preconfigured rows (the hash lookup itself is not under test here). */
// biome-ignore lint/suspicious/noExplicitAny: minimal prisma double.
function fakePrisma(opts: { key?: Key; userActive?: boolean; project?: any }): any {
  return {
    apiKey: {
      findUnique: async () => opts.key ?? null,
      update: async () => {},
    },
    user: {
      findUnique: async () =>
        opts.key
          ? {
              id: opts.key.userId,
              email: 'u@x.io',
              role: 'USER',
              isActive: opts.userActive ?? true,
            }
          : null,
    },
    project: { findUnique: async () => opts.project ?? null },
  };
}

const active: Key = { id: 'k1', userId: 'u1', status: 'ACTIVE', expiresAt: null };

describe('resolveUser', () => {
  it('returns null for empty / unknown keys', async () => {
    expect(await resolveUser(fakePrisma({}), '')).toBeNull();
    expect(await resolveUser(fakePrisma({}), 'bd_unknown')).toBeNull();
  });

  it('rejects revoked, expired keys and inactive users', async () => {
    expect(
      await resolveUser(fakePrisma({ key: { ...active, status: 'REVOKED' } }), 'k'),
    ).toBeNull();
    expect(
      await resolveUser(fakePrisma({ key: { ...active, expiresAt: new Date(0) } }), 'k'),
    ).toBeNull();
    expect(await resolveUser(fakePrisma({ key: active, userActive: false }), 'k')).toBeNull();
  });

  it('resolves an active key to its owner principal', async () => {
    const principal = await resolveUser(fakePrisma({ key: active }), 'k');
    expect(principal).toEqual({ userId: 'u1', email: 'u@x.io', role: 'USER' });
  });
});

describe('resolveProject', () => {
  it('returns the project only when the user owns it', async () => {
    const owned = { id: 'p1', slug: 'demo', name: 'Demo', ownerId: 'u1' };
    expect(await resolveProject(fakePrisma({ project: owned }), 'u1', 'demo')).toEqual({
      id: 'p1',
      slug: 'demo',
      name: 'Demo',
    });
    expect(await resolveProject(fakePrisma({ project: owned }), 'other', 'demo')).toBeNull();
    expect(await resolveProject(fakePrisma({ project: null }), 'u1', 'missing')).toBeNull();
  });
});
