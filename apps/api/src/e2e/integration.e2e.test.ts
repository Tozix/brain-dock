// Integration tests against REAL services (Postgres + Qdrant). Gated by RUN_E2E so the regular
// `bun test` skips them — only the CI `e2e` job (and local runs with the infra up) execute them.
//   RUN_E2E=1 DATABASE_URL=... QDRANT_URL=... bun test apps/api/src/e2e

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPrismaClient } from '@brain-dock/db';
import { DeterministicEmbeddingProvider } from '@brain-dock/embedding';
import { RepositoryIndexer } from '@brain-dock/indexer';
import { MemoryService, SymbolIndexService } from '@brain-dock/knowledge';
import { IngestionService, SearchService } from '@brain-dock/search';
import { QdrantStore } from '@brain-dock/storage';

const e2e = process.env.RUN_E2E ? describe : describe.skip;

const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:16333';
const DATABASE_URL = process.env.DATABASE_URL ?? '';
// Unique per run so parallel/repeat runs don't collide; stamped from the clock at module load.
const RUN = `e2e_${Date.now()}`;

// Project-scoped tables now have FK constraints — rows must belong to a real user + project.
// Deleting the user at the end exercises the cascades (project → items/symbols/edges).
type PrismaClient = NonNullable<ReturnType<typeof createPrismaClient>>;
async function createProjectFixture(prisma: PrismaClient, tag: string) {
  const user = await prisma.user.create({
    data: { email: `${tag}_${RUN}@e2e.local`, passwordHash: 'x', role: 'USER' },
  });
  const project = await prisma.project.create({
    data: { name: `${tag} ${RUN}`, slug: `${tag}-${RUN}`.toLowerCase(), ownerId: user.id },
  });
  return {
    projectId: project.id,
    cleanup: () => prisma.user.delete({ where: { id: user.id } }).catch(() => {}),
  };
}

e2e('RAG over real Qdrant', () => {
  const embedder = new DeterministicEmbeddingProvider(256);
  const store = new QdrantStore({ url: QDRANT_URL });
  const collection = `code_${RUN}`;
  const projectId = `proj_${RUN}`;
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'bd-e2e-'));
    writeFileSync(
      join(dir, 'payments.service.ts'),
      'export class PaymentsGatewayService { chargeCustomerInvoice() {} }\n',
    );
  });

  afterAll(async () => {
    rmSync(dir, { recursive: true, force: true });
    await store.deleteCollection(collection).catch(() => {});
  });

  it('ingests a repo and finds a symbol by hybrid search', async () => {
    const ingestion = new IngestionService(embedder, store);
    const report = await ingestion.ingestRepository(dir, { projectId, collection, repo: 'main' });
    expect(report.chunks).toBeGreaterThan(0);

    const search = new SearchService(embedder, store);
    const results = await search.search('PaymentsGatewayService charge invoice', {
      projectId,
      collection,
    });
    expect(results.some((r) => r.symbol === 'PaymentsGatewayService')).toBe(true);
    // Project isolation: a different projectId sees nothing in this collection.
    expect(
      await search.search('PaymentsGatewayService', { projectId: 'other', collection }),
    ).toEqual([]);
  });
});

e2e('Project memory over real Postgres + Qdrant', () => {
  const embedder = new DeterministicEmbeddingProvider(256);
  const store = new QdrantStore({ url: QDRANT_URL });
  const prisma = DATABASE_URL ? createPrismaClient(DATABASE_URL) : null;
  const memory = prisma ? new MemoryService(prisma, embedder, store) : null;
  let fixture: Awaited<ReturnType<typeof createProjectFixture>> | null = null;
  let createdId: string | null = null;

  beforeAll(async () => {
    if (prisma) fixture = await createProjectFixture(prisma, 'mem');
  });

  afterAll(async () => {
    if (memory && fixture && createdId) {
      await memory.delete(fixture.projectId, createdId).catch(() => {});
    }
    await fixture?.cleanup();
    await prisma?.$disconnect();
  });

  it('remembers and retrieves a memory by semantic search', async () => {
    if (!memory || !fixture) throw new Error('DATABASE_URL is required for the memory e2e test');
    const item = await memory.remember({
      projectId: fixture.projectId,
      content: 'We deploy by building images on the server with docker compose, no registry.',
      type: 'DECISION',
    });
    createdId = item.id;

    const hits = await memory.search(fixture.projectId, 'how do we deploy the app', 5);
    expect(hits.some((h) => h.item.id === item.id)).toBe(true);
  });
});

e2e('Server-side symbol index over real Postgres', () => {
  const prisma = DATABASE_URL ? createPrismaClient(DATABASE_URL) : null;
  const symbols = prisma ? new SymbolIndexService(prisma) : null;
  let fixture: Awaited<ReturnType<typeof createProjectFixture>> | null = null;
  let projectId = '';
  const repo = 'api';

  beforeAll(async () => {
    if (prisma) {
      fixture = await createProjectFixture(prisma, 'sym');
      projectId = fixture.projectId;
    }
  });

  afterAll(async () => {
    // Deleting the user cascades user → project → code_symbols/code_edges.
    await fixture?.cleanup();
    await prisma?.$disconnect();
  });

  it('persists an index and reconstructs structural queries + graph', async () => {
    if (!symbols) throw new Error('DATABASE_URL is required for the symbol-index e2e test');
    const index = new RepositoryIndexer().indexFiles('/repo', [
      {
        path: 'cats.controller.ts',
        content: `import { Controller, Get } from '@nestjs/common';
import { CatsService } from './cats.service';
@Controller('cats')
export class CatsController {
  constructor(private readonly cats: CatsService) {}
  @Get('list') list() {}
}`,
      },
      {
        path: 'cats.service.ts',
        content: `import { Injectable } from '@nestjs/common';
@Injectable()
export class CatsService {}`,
      },
    ]);

    const persisted = await symbols.persist({ projectId, repo }, index);
    expect(persisted.symbols).toBeGreaterThan(0);

    const controllers = await symbols.findSymbols(projectId, { role: 'controller' });
    expect(controllers.some((s) => s.name === 'CatsController')).toBe(true);

    const endpoints = await symbols.endpoints(projectId);
    expect(endpoints.some((e) => e.path.includes('list'))).toBe(true);

    const graph = await symbols.graph(projectId);
    expect(graph.dependents('CatsService')).toContain('CatsController');

    // Re-persist replaces (no duplicates).
    const again = await symbols.persist({ projectId, repo }, index);
    const all = await symbols.findSymbols(projectId, {});
    expect(all.length).toBe(again.symbols);
  });
});
