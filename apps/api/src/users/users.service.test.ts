import { describe, expect, it } from 'bun:test';
import { Role } from '@brain-dock/shared';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../common/auth-user';
import { UsersService } from './users.service';

const admin: AuthenticatedUser = { id: 'a1', email: 'admin@x.io', role: Role.ADMIN };
const superAdmin: AuthenticatedUser = { id: 's1', email: 'root@x.io', role: Role.SUPER_ADMIN };

type UserRow = {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  isActive: boolean;
  createdAt: Date;
};

type Select = Record<string, unknown> | undefined;

/** Apply the service's `select` projection the way Prisma would (incl. `_count`). */
function project(row: UserRow, select: Select) {
  if (!select) return row;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(select)) {
    if (key === '_count') out[key] = { projects: 0, apiKeys: 0 };
    else out[key] = row[key as keyof UserRow];
  }
  return out;
}

/** Minimal in-memory Prisma double for the `user` model, recording findMany args. */
function fakePrisma(seed: UserRow[] = []) {
  const rows = [...seed];
  const findManyArgs: Array<Record<string, unknown>> = [];
  return {
    rows,
    findManyArgs,
    client: {
      user: {
        findUnique: async ({ where, select }: { where: { id: string }; select?: Select }) => {
          const row = rows.find((r) => r.id === where.id);
          return row ? project(row, select) : null;
        },
        findMany: async (args: {
          where: { email?: { contains: string } };
          take: number;
          skip: number;
          select?: Select;
        }) => {
          findManyArgs.push(args);
          const q = args.where.email?.contains.toLowerCase();
          return rows
            .filter((r) => (q ? r.email.toLowerCase().includes(q) : true))
            .slice(args.skip, args.skip + args.take)
            .map((r) => project(r, args.select));
        },
        update: async ({
          where,
          data,
          select,
        }: {
          where: { id: string };
          data: Partial<UserRow>;
          select?: Select;
        }) => {
          const row = rows.find((r) => r.id === where.id) as UserRow;
          Object.assign(row, data);
          return project(row, select);
        },
      },
    },
  };
}

/** AuditService double recording log entries. */
function fakeAudit() {
  const entries: Array<Record<string, unknown>> = [];
  return { entries, log: async (entry: Record<string, unknown>) => void entries.push(entry) };
}

const make = (prisma: ReturnType<typeof fakePrisma>, audit = fakeAudit()) =>
  // biome-ignore lint/suspicious/noExplicitAny: test doubles intentionally narrow the real types.
  new UsersService(prisma as any, audit as any);

const user = (overrides: Partial<UserRow> = {}): UserRow => ({
  id: 'u1',
  email: 'user@x.io',
  passwordHash: 'hash-must-never-leak',
  role: Role.USER,
  isActive: true,
  createdAt: new Date(0),
  ...overrides,
});

describe('UsersService.list', () => {
  it('never returns passwordHash', async () => {
    const service = make(fakePrisma([user()]));
    const [row] = await service.list({ take: 100, skip: 0 });
    expect(row).toBeDefined();
    expect(Object.keys(row ?? {})).not.toContain('passwordHash');
    expect(Object.values(row ?? {})).not.toContain('hash-must-never-leak');
  });

  it('filters by email substring (case-insensitive) and paginates', async () => {
    const prisma = fakePrisma([
      user(),
      user({ id: 'u2', email: 'Boss@Corp.io' }),
      user({ id: 'u3', email: 'dev@corp.io' }),
    ]);
    const found = await make(prisma).list({ q: 'CORP', take: 1, skip: 1 });
    expect(found).toHaveLength(1);
    expect(found[0]?.id).toBe('u3');
    expect(prisma.findManyArgs[0]).toMatchObject({
      where: { email: { contains: 'CORP', mode: 'insensitive' } },
      orderBy: { createdAt: 'desc' },
      take: 1,
      skip: 1,
    });
  });
});

describe('UsersService.get', () => {
  it('returns the projection with counters and without the hash', async () => {
    const found = await make(fakePrisma([user()])).get('u1');
    expect(found).toEqual({
      id: 'u1',
      email: 'user@x.io',
      role: Role.USER,
      isActive: true,
      createdAt: new Date(0),
      _count: { projects: 0, apiKeys: 0 },
    });
  });

  it('404s on an unknown id', async () => {
    await expect(make(fakePrisma()).get('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('UsersService.update — isActive', () => {
  it('lets an ADMIN deactivate another user (and audits user.update)', async () => {
    const prisma = fakePrisma([user()]);
    const audit = fakeAudit();
    const updated = await make(prisma, audit).update(admin, 'u1', { isActive: false });
    expect(updated.isActive).toBe(false);
    expect(prisma.rows[0]?.isActive).toBe(false);
    expect(audit.entries).toEqual([
      {
        actorId: admin.id,
        action: 'user.update',
        targetType: 'User',
        targetId: 'u1',
        metadata: { isActive: false },
      },
    ]);
  });

  it('rejects changing your own isActive with BadRequest', async () => {
    const prisma = fakePrisma([user({ id: admin.id, email: admin.email, role: Role.ADMIN })]);
    await expect(make(prisma).update(admin, admin.id, { isActive: false })).rejects.toThrow(
      new BadRequestException('cannot deactivate yourself'),
    );
    expect(prisma.rows[0]?.isActive).toBe(true);
  });
});

describe('UsersService.update — role', () => {
  it('forbids an ADMIN from changing roles', async () => {
    const prisma = fakePrisma([user()]);
    await expect(make(prisma).update(admin, 'u1', { role: Role.ADMIN })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.rows[0]?.role).toBe(Role.USER);
  });

  it('lets a SUPER_ADMIN promote a user (incl. to SUPER_ADMIN)', async () => {
    const prisma = fakePrisma([user()]);
    const updated = await make(prisma).update(superAdmin, 'u1', { role: Role.SUPER_ADMIN });
    expect(updated.role).toBe(Role.SUPER_ADMIN);
  });

  it('rejects changing your own role', async () => {
    const prisma = fakePrisma([
      user({ id: superAdmin.id, email: superAdmin.email, role: Role.SUPER_ADMIN }),
    ]);
    await expect(
      make(prisma).update(superAdmin, superAdmin.id, { role: Role.USER }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.rows[0]?.role).toBe(Role.SUPER_ADMIN);
  });

  it('404s when the target user does not exist', async () => {
    await expect(
      make(fakePrisma()).update(superAdmin, 'missing', { isActive: false }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
