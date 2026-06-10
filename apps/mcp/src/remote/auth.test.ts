import { describe, expect, it } from 'bun:test';
import { resolveProject, resolveUser } from './auth';

type Key = {
  id: string;
  userId: string;
  status: string;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  rateLimit: number | null;
};

interface FakePrismaOpts {
  key?: Key;
  userActive?: boolean;
  // biome-ignore lint/suspicious/noExplicitAny: minimal prisma double.
  project?: any;
  onKeyUpdate?: () => void;
}

/** Fake prisma returning preconfigured rows (the hash lookup itself is not under test here). */
// biome-ignore lint/suspicious/noExplicitAny: minimal prisma double.
function fakePrisma(opts: FakePrismaOpts): any {
  return {
    apiKey: {
      // resolveUser issues a single findUnique with `include: { user: true }`.
      findUnique: async () =>
        opts.key
          ? {
              ...opts.key,
              user: {
                id: opts.key.userId,
                email: 'u@x.io',
                role: 'USER',
                isActive: opts.userActive ?? true,
              },
            }
          : null,
      update: async () => {
        opts.onKeyUpdate?.();
        return {};
      },
    },
    project: { findUnique: async () => opts.project ?? null },
  };
}

const active: Key = {
  id: 'k1',
  userId: 'u1',
  status: 'ACTIVE',
  expiresAt: null,
  lastUsedAt: null,
  rateLimit: null,
};

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

  it('resolves an active key to its owner principal with key id + rate limit', async () => {
    const principal = await resolveUser(fakePrisma({ key: { ...active, rateLimit: 42 } }), 'k');
    expect(principal).toEqual({
      userId: 'u1',
      email: 'u@x.io',
      role: 'USER',
      keyId: 'k1',
      rateLimit: 42,
    });
  });

  it('stamps lastUsedAt only when stale (fire-and-forget)', async () => {
    let updates = 0;
    const onKeyUpdate = () => {
      updates += 1;
    };

    // Fresh stamp → no update.
    await resolveUser(fakePrisma({ key: { ...active, lastUsedAt: new Date() }, onKeyUpdate }), 'k');
    expect(updates).toBe(0);

    // Stale stamp → one background update.
    await resolveUser(
      fakePrisma({ key: { ...active, lastUsedAt: new Date(0) }, onKeyUpdate }),
      'k',
    );
    await Bun.sleep(0); // let the fire-and-forget promise settle
    expect(updates).toBe(1);
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
