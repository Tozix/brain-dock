import { describe, expect, it } from 'bun:test';
import { Role } from '@brain-dock/shared';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../common/auth-user';
import { ProjectsService } from './projects.service';

const owner: AuthenticatedUser = { id: 'u1', email: 'owner@x.io', role: Role.USER };
const stranger: AuthenticatedUser = { id: 'u2', email: 'other@x.io', role: Role.USER };
const admin: AuthenticatedUser = { id: 'u3', email: 'admin@x.io', role: Role.ADMIN };

type Project = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  ownerId: string;
  createdAt: Date;
};

/** Minimal in-memory Prisma double for the `project` model, recording delete order + list args. */
function fakePrisma(seed: Project[] = [], events: string[] = []) {
  const rows = [...seed];
  const findManyArgs: Array<{ take?: number; skip?: number }> = [];
  let seq = seed.length;
  return {
    rows,
    findManyArgs,
    client: {
      project: {
        findUnique: async ({ where }: { where: { id?: string; slug?: string } }) =>
          rows.find((p) => (where.id ? p.id === where.id : p.slug === where.slug)) ?? null,
        create: async ({ data }: { data: Omit<Project, 'id' | 'createdAt'> }) => {
          const row: Project = { id: `p${++seq}`, createdAt: new Date(0), ...data };
          rows.push(row);
          return row;
        },
        findMany: async (args: { where: { ownerId: string }; take?: number; skip?: number }) => {
          findManyArgs.push({ take: args.take, skip: args.skip });
          return rows.filter((p) => p.ownerId === args.where.ownerId);
        },
        delete: async ({ where }: { where: { id: string } }) => {
          events.push(`delete:${where.id}`);
          const i = rows.findIndex((p) => p.id === where.id);
          return rows.splice(i, 1)[0];
        },
      },
    },
  };
}

const audit = { log: async () => {} };

/** VectorCleanupService double — records purge calls into the shared events log. */
function fakeVectors(events: string[] = []) {
  return { purgeProject: async (id: string) => void events.push(`purge:${id}`) };
}

const project = (overrides: Partial<Project> = {}): Project => ({
  id: 'p1',
  name: 'One',
  slug: 'one',
  description: null,
  ownerId: owner.id,
  createdAt: new Date(0),
  ...overrides,
});

const make = (prisma: ReturnType<typeof fakePrisma>, vectors = fakeVectors()) =>
  // biome-ignore lint/suspicious/noExplicitAny: test doubles intentionally narrow the real types.
  new ProjectsService(prisma as any, audit as any, vectors as any);

describe('ProjectsService.getOwned', () => {
  it('returns the project to its owner', async () => {
    const service = make(fakePrisma([project()]));
    const found = await service.getOwned(owner, 'p1');
    expect(found.id).toBe('p1');
  });

  it("forbids a plain USER from accessing someone else's project", async () => {
    const service = make(fakePrisma([project()]));
    await expect(service.getOwned(stranger, 'p1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("lets an ADMIN access someone else's project", async () => {
    const service = make(fakePrisma([project()]));
    const found = await service.getOwned(admin, 'p1');
    expect(found.ownerId).toBe(owner.id);
  });

  it('404s on an unknown project id', async () => {
    const service = make(fakePrisma());
    await expect(service.getOwned(owner, 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ProjectsService.create', () => {
  it('rejects a duplicate slug with ConflictException', async () => {
    const service = make(fakePrisma([project()]));
    await expect(service.create(owner, { name: 'Clone', slug: 'one' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('creates a project owned by the caller', async () => {
    const prisma = fakePrisma();
    const created = await make(prisma).create(owner, { name: 'Two', slug: 'two' });
    expect(created.slug).toBe('two');
    expect(created.ownerId).toBe(owner.id);
  });
});

describe('ProjectsService.remove', () => {
  it("forbids removing someone else's project (and purges nothing)", async () => {
    const events: string[] = [];
    const service = make(fakePrisma([project()], events), fakeVectors(events));
    await expect(service.remove(stranger, 'p1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(events).toEqual([]); // neither vectors nor the row were touched
  });

  it('purges vectors BEFORE deleting the Postgres row', async () => {
    const events: string[] = [];
    const service = make(fakePrisma([project()], events), fakeVectors(events));
    const res = await service.remove(owner, 'p1');
    expect(res).toEqual({ id: 'p1', deleted: true });
    expect(events).toEqual(['purge:p1', 'delete:p1']);
  });
});

describe('ProjectsService.list', () => {
  it('passes take/skip through to prisma', async () => {
    const prisma = fakePrisma([project()]);
    await make(prisma).list(owner, { take: 5, skip: 10 });
    expect(prisma.findManyArgs).toEqual([{ take: 5, skip: 10 }]);
  });

  it('defaults to take=100 skip=0 when no page is given', async () => {
    const prisma = fakePrisma();
    await make(prisma).list(owner);
    expect(prisma.findManyArgs).toEqual([{ take: 100, skip: 0 }]);
  });
});
