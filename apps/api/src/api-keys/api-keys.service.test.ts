import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { ApiKeyStatus } from '@brain-dock/db';
import { Role } from '@brain-dock/shared';
import type { AuthenticatedUser } from '../common/auth-user';
import { ApiKeysService } from './api-keys.service';

const actor: AuthenticatedUser = { id: 'u1', email: 'admin@x.io', role: Role.SUPER_ADMIN };

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

  it('attributes the key to dto.userId when provided', async () => {
    const prisma = fakePrisma();
    const service = make(prisma);
    await service.issue(actor, { name: 'for-bob', userId: 'u2' });
    expect(prisma.rows[0]?.userId).toBe('u2');
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
