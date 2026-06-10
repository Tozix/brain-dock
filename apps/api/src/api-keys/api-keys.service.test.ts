import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { ApiKeyStatus } from '@brain-dock/db';
import { Role } from '@brain-dock/shared';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../common/auth-user';
import { ApiKeysService } from './api-keys.service';

const actor: AuthenticatedUser = { id: 'u1', email: 'admin@x.io', role: Role.SUPER_ADMIN };
const admin: AuthenticatedUser = { id: 'a1', email: 'staff@x.io', role: Role.ADMIN };
const user: AuthenticatedUser = { id: 'u2', email: 'user@x.io', role: Role.USER };

type KeyRow = {
  id: string;
  name: string;
  description: string | null;
  prefix: string;
  keyHash: string;
  userId: string;
  rateLimit: number | null;
  expiresAt: Date | null;
  status: ApiKeyStatus;
  lastUsedAt: Date | null;
  createdAt: Date;
};

type UserRow = { id: string; email: string; role: Role; isActive: boolean };

type Select = Record<string, unknown> | undefined;

/** Apply a Prisma-style `select` projection, resolving the `user.email` relation. */
function project(row: KeyRow, select: Select, users: UserRow[]) {
  if (!select) return row;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(select)) {
    if (key === 'user') out[key] = { email: users.find((u) => u.id === row.userId)?.email };
    else out[key] = row[key as keyof KeyRow];
  }
  return out;
}

/** Minimal in-memory Prisma double for `apiKey` + `user`, recording update calls. */
function fakePrisma(keys: KeyRow[] = [], users: UserRow[] = []) {
  const rows = [...keys];
  const updates: Array<{ id: string; data: Partial<KeyRow> }> = [];
  let seq = keys.length;
  return {
    rows,
    updates,
    client: {
      apiKey: {
        create: async ({
          data,
        }: {
          data: Omit<KeyRow, 'id' | 'status' | 'lastUsedAt' | 'createdAt'>;
        }) => {
          const row: KeyRow = {
            id: `k${++seq}`,
            status: ApiKeyStatus.ACTIVE,
            lastUsedAt: null,
            createdAt: new Date(0),
            ...data,
          };
          rows.push(row);
          return row;
        },
        findUnique: async ({ where }: { where: { id?: string; keyHash?: string } }) =>
          rows.find((r) => (where.id ? r.id === where.id : r.keyHash === where.keyHash)) ?? null,
        findMany: async (args: {
          where?: { userId?: string };
          take: number;
          skip: number;
          select?: Select;
        }) =>
          rows
            .filter((r) => (args.where?.userId ? r.userId === args.where.userId : true))
            .slice(args.skip, args.skip + args.take)
            .map((r) => project(r, args.select, users)),
        update: async ({ where, data }: { where: { id: string }; data: Partial<KeyRow> }) => {
          updates.push({ id: where.id, data });
          const row = rows.find((r) => r.id === where.id) as KeyRow;
          Object.assign(row, data);
          return row;
        },
      },
      user: {
        findUnique: async ({ where }: { where: { id: string } }) =>
          users.find((u) => u.id === where.id) ?? null,
      },
    },
  };
}

const audit = { log: async () => {} };

const make = (prisma: ReturnType<typeof fakePrisma>) =>
  // biome-ignore lint/suspicious/noExplicitAny: test doubles intentionally narrow the real types.
  new ApiKeysService(prisma as any, audit as any);

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** Flush fire-and-forget promises (the lastUsedAt refresh is not awaited by the service). */
const flush = () => new Promise((resolve) => setImmediate(resolve));

function activeKey(secret: string, overrides: Partial<KeyRow> = {}): KeyRow {
  return {
    id: 'k1',
    name: 'ci',
    description: null,
    prefix: secret.slice(0, 10),
    keyHash: sha256(secret),
    userId: 'u1',
    rateLimit: null,
    expiresAt: null,
    status: ApiKeyStatus.ACTIVE,
    lastUsedAt: null,
    createdAt: new Date(0),
    ...overrides,
  };
}

describe('ApiKeysService.issue', () => {
  it('returns a bd_-prefixed secret and stores only its sha256 hash', async () => {
    const prisma = fakePrisma();
    const service = make(prisma);
    const issued = await service.issue(actor, { name: 'ci' });

    expect(issued.key.startsWith('bd_')).toBe(true);
    expect(issued.prefix).toBe(issued.key.slice(0, 10));

    const stored = prisma.rows[0];
    expect(stored?.keyHash).toBe(sha256(issued.key));
    // The raw secret never lands in the database row.
    expect(Object.values(stored ?? {})).not.toContain(issued.key);
  });

  it('lets a plain USER issue a key for themselves', async () => {
    const prisma = fakePrisma();
    const issued = await make(prisma).issue(user, { name: 'mine' });
    expect(issued.key.startsWith('bd_')).toBe(true);
    expect(prisma.rows[0]?.userId).toBe(user.id);
  });

  it('accepts an explicit userId equal to the caller for a plain USER', async () => {
    const prisma = fakePrisma();
    await make(prisma).issue(user, { name: 'mine', userId: user.id });
    expect(prisma.rows[0]?.userId).toBe(user.id);
  });

  it('forbids a plain USER from issuing a key for another user', async () => {
    const prisma = fakePrisma();
    await expect(make(prisma).issue(user, { name: 'evil', userId: 'u9' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.rows).toHaveLength(0);
  });

  it('forbids a plain USER from setting rateLimit (admin-only field)', async () => {
    const prisma = fakePrisma();
    await expect(make(prisma).issue(user, { name: 'fast', rateLimit: 999 })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.rows).toHaveLength(0);
  });

  it('lets an ADMIN issue a key for another user with a rateLimit', async () => {
    const prisma = fakePrisma();
    await make(prisma).issue(admin, { name: 'for-bob', userId: 'u2', rateLimit: 50 });
    expect(prisma.rows[0]?.userId).toBe('u2');
    expect(prisma.rows[0]?.rateLimit).toBe(50);
  });

  it('attributes the key to dto.userId when provided by an admin', async () => {
    const prisma = fakePrisma();
    const service = make(prisma);
    await service.issue(actor, { name: 'for-bob', userId: 'u2' });
    expect(prisma.rows[0]?.userId).toBe('u2');
  });
});

describe('ApiKeysService.list', () => {
  const page = { take: 100, skip: 0 };

  it('returns only the caller’s keys (without keyHash) by default', async () => {
    const prisma = fakePrisma([
      activeKey('bd_mine', { id: 'k1', userId: user.id }),
      activeKey('bd_other', { id: 'k2', userId: 'u9' }),
    ]);
    const keys = await make(prisma).list(user, page);
    expect(keys).toHaveLength(1);
    expect(keys[0]?.id).toBe('k1');
    expect(Object.keys(keys[0] ?? {})).not.toContain('keyHash');
  });

  it('forbids all=true for a plain USER', async () => {
    const prisma = fakePrisma([activeKey('bd_mine', { userId: user.id })]);
    await expect(make(prisma).list(user, page, true)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns every key with the owner email for an ADMIN with all=true', async () => {
    const prisma = fakePrisma(
      [
        activeKey('bd_one', { id: 'k1', userId: 'u1' }),
        activeKey('bd_two', { id: 'k2', userId: 'u2' }),
      ],
      [
        { id: 'u1', email: 'admin@x.io', role: Role.SUPER_ADMIN, isActive: true },
        { id: 'u2', email: 'user@x.io', role: Role.USER, isActive: true },
      ],
    );
    const keys = (await make(prisma).list(admin, page, true)) as Array<{
      user?: { email: string };
    }>;
    expect(keys).toHaveLength(2);
    expect(keys.map((k) => k.user?.email ?? null)).toEqual(['admin@x.io', 'user@x.io']);
    expect(Object.keys(keys[0] ?? {})).not.toContain('keyHash');
  });
});

describe('ApiKeysService.revoke', () => {
  it('lets the owner revoke their own key', async () => {
    const prisma = fakePrisma([activeKey('bd_mine', { userId: user.id })]);
    const res = await make(prisma).revoke(user, 'k1');
    expect(res).toEqual({ id: 'k1', status: ApiKeyStatus.REVOKED });
    expect(prisma.rows[0]?.status).toBe(ApiKeyStatus.REVOKED);
  });

  it("404s when a plain USER revokes someone else's key (existence not leaked)", async () => {
    const prisma = fakePrisma([activeKey('bd_other', { userId: 'u9' })]);
    await expect(make(prisma).revoke(user, 'k1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.rows[0]?.status).toBe(ApiKeyStatus.ACTIVE);
  });

  it("lets an ADMIN revoke another user's key", async () => {
    const prisma = fakePrisma([activeKey('bd_other', { userId: 'u9' })]);
    const res = await make(prisma).revoke(admin, 'k1');
    expect(res.status).toBe(ApiKeyStatus.REVOKED);
  });

  it('404s on an unknown key id', async () => {
    await expect(make(fakePrisma()).revoke(actor, 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('ApiKeysService.resolveActive', () => {
  it('resolves an active, unexpired key from the raw secret', async () => {
    const secret = 'bd_resolve-me';
    const prisma = fakePrisma([activeKey(secret)]);
    const key = await make(prisma).resolveActive(secret);
    expect(key?.id).toBe('k1');
  });

  it('rejects a REVOKED key', async () => {
    const secret = 'bd_revoked';
    const prisma = fakePrisma([activeKey(secret, { status: ApiKeyStatus.REVOKED })]);
    expect(await make(prisma).resolveActive(secret)).toBeNull();
  });

  it('rejects an expired key', async () => {
    const secret = 'bd_expired';
    const prisma = fakePrisma([activeKey(secret, { expiresAt: new Date(Date.now() - 1000) })]);
    expect(await make(prisma).resolveActive(secret)).toBeNull();
  });

  it('refreshes lastUsedAt when it is older than 60s (or never set)', async () => {
    const secret = 'bd_stale';
    const prisma = fakePrisma([activeKey(secret, { lastUsedAt: new Date(Date.now() - 120_000) })]);
    await make(prisma).resolveActive(secret);
    await flush();
    expect(prisma.updates).toHaveLength(1);
    expect(prisma.updates[0]?.data.lastUsedAt).toBeInstanceOf(Date);
  });

  it('does NOT touch lastUsedAt when it is fresher than 60s', async () => {
    const secret = 'bd_fresh';
    const prisma = fakePrisma([activeKey(secret, { lastUsedAt: new Date() })]);
    await make(prisma).resolveActive(secret);
    await flush();
    expect(prisma.updates).toHaveLength(0);
  });
});

describe('ApiKeysService.resolvePrincipal', () => {
  it('returns the owning principal for an active key + active user', async () => {
    const secret = 'bd_principal';
    const prisma = fakePrisma(
      [activeKey(secret)],
      [{ id: 'u1', email: 'owner@x.io', role: Role.USER, isActive: true }],
    );
    const principal = await make(prisma).resolvePrincipal(secret);
    expect(principal).toEqual({ id: 'u1', email: 'owner@x.io', role: Role.USER });
  });

  it('rejects a key whose owner has been deactivated', async () => {
    const secret = 'bd_deactivated-owner';
    const prisma = fakePrisma(
      [activeKey(secret)],
      [{ id: 'u1', email: 'owner@x.io', role: Role.USER, isActive: false }],
    );
    expect(await make(prisma).resolvePrincipal(secret)).toBeNull();
  });
});
