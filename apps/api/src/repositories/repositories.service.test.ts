import { describe, expect, it } from 'bun:test';
import type { IndexJob, IndexQueue } from '@brain-dock/core';
import { Role } from '@brain-dock/shared';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../common/auth-user';
import { RepositoriesService } from './repositories.service';

const user: AuthenticatedUser = { id: 'u1', email: 'u@x.io', role: Role.USER };

type Repo = {
  id: string;
  projectId: string;
  name: string;
  alias: string;
  root: string;
  defaultBranch: string | null;
  createdAt: Date;
};

/** Minimal in-memory Prisma double for the `repository` model. */
function fakePrisma(seed: Repo[] = []) {
  const rows = [...seed];
  let seq = seed.length;
  return {
    rows,
    client: {
      repository: {
        findUnique: async ({
          where,
        }: {
          where: { id?: string; projectId_alias?: { projectId: string; alias: string } };
        }) => {
          if (where.id) return rows.find((r) => r.id === where.id) ?? null;
          const { projectId, alias } = where.projectId_alias ?? {};
          return rows.find((r) => r.projectId === projectId && r.alias === alias) ?? null;
        },
        findMany: async ({ where }: { where: { projectId: string } }) =>
          rows.filter((r) => r.projectId === where.projectId),
        create: async ({ data }: { data: Omit<Repo, 'id' | 'createdAt'> }) => {
          const row: Repo = { id: `r${++seq}`, createdAt: new Date(0), ...data };
          rows.push(row);
          return row;
        },
        update: async ({ where, data }: { where: { id: string }; data: Partial<Repo> }) => {
          const row = rows.find((r) => r.id === where.id) as Repo;
          Object.assign(row, data);
          return row;
        },
        delete: async ({ where }: { where: { id: string } }) => {
          const i = rows.findIndex((r) => r.id === where.id);
          return rows.splice(i, 1)[0];
        },
      },
    },
  };
}

const audit = { log: async () => {} };

function fakeQueue() {
  const jobs: IndexJob[] = [];
  const queue: IndexQueue = { enqueue: async (job) => void jobs.push(job) };
  return { queue, jobs };
}

/** Projects double: owns p1; everything else is forbidden. */
const projects = {
  getOwned: async (_u: AuthenticatedUser, projectId: string) => {
    if (projectId !== 'p1') throw new ForbiddenException('Not your project');
    return { id: projectId };
  },
};

/** Config double: server-path reindexing enabled (the dev default). */
const config = { env: { INDEX_SERVER_PATHS: true } };

// biome-ignore lint/suspicious/noExplicitAny: test doubles intentionally narrow the real types.
const make = (prisma: any, q = fakeQueue()) => ({
  // biome-ignore lint/suspicious/noExplicitAny: test doubles intentionally narrow the real types.
  service: new RepositoriesService(prisma, audit as any, projects as any, q.queue, config as any),
  jobs: q.jobs,
});

describe('RepositoriesService', () => {
  it('creates a repository in an owned project', async () => {
    const { service } = make(fakePrisma());
    const repo = await service.create(user, 'p1', {
      name: 'API',
      alias: 'api',
      root: './apps/api',
    });
    expect(repo.alias).toBe('api');
    expect(repo.projectId).toBe('p1');
  });

  it('rejects a duplicate alias within the project', async () => {
    const prisma = fakePrisma([
      {
        id: 'r1',
        projectId: 'p1',
        name: 'API',
        alias: 'api',
        root: './a',
        defaultBranch: null,
        createdAt: new Date(0),
      },
    ]);
    const { service } = make(prisma);
    await expect(
      service.create(user, 'p1', { name: 'API2', alias: 'api', root: './b' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('forbids operating on a project the user does not own', async () => {
    const { service } = make(fakePrisma());
    await expect(
      service.create(user, 'other', { name: 'X', alias: 'x', root: './x' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('404s when the repository belongs to a different project', async () => {
    const prisma = fakePrisma([
      {
        id: 'r1',
        projectId: 'pZ',
        name: 'API',
        alias: 'api',
        root: './a',
        defaultBranch: null,
        createdAt: new Date(0),
      },
    ]);
    const { service } = make(prisma);
    await expect(service.get(user, 'p1', 'r1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('enqueues an index job with repo alias and id on reindex', async () => {
    const prisma = fakePrisma([
      {
        id: 'r1',
        projectId: 'p1',
        name: 'API',
        alias: 'api',
        root: './apps/api',
        defaultBranch: null,
        createdAt: new Date(0),
      },
    ]);
    const { service, jobs } = make(prisma);
    const res = await service.reindex(user, 'p1', 'r1');
    expect(res).toEqual({ id: 'r1', queued: true });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toEqual({
      projectId: 'p1',
      rootDir: './apps/api',
      collection: 'code',
      repo: 'api',
      repositoryId: 'r1',
    });
  });
});
