// Integration tests against REAL services (Postgres + Qdrant). Gated by RUN_E2E so the regular
// `bun test` skips them — only the CI `e2e` job (and local runs with the infra up) execute them.
//   RUN_E2E=1 DATABASE_URL=... QDRANT_URL=... bun test apps/api/src/e2e

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPrismaClient } from '@brain-dock/db';
import { DeterministicEmbeddingProvider } from '@brain-dock/embedding';
import { MemoryService } from '@brain-dock/knowledge';
import { IngestionService, SearchService } from '@brain-dock/search';
import { QdrantStore } from '@brain-dock/storage';

const e2e = process.env.RUN_E2E ? describe : describe.skip;

const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:16333';
const DATABASE_URL = process.env.DATABASE_URL ?? '';
// Unique per run so parallel/repeat runs don't collide; stamped from the clock at module load.
const RUN = `e2e_${Date.now()}`;

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
  const projectId = `mem_${RUN}`;
  const prisma = DATABASE_URL ? createPrismaClient(DATABASE_URL) : null;
  const memory = prisma ? new MemoryService(prisma, embedder, store) : null;
  let createdId: string | null = null;

  afterAll(async () => {
    if (memory && createdId) await memory.delete(projectId, createdId).catch(() => {});
    await prisma?.$disconnect();
  });

  it('remembers and retrieves a memory by semantic search', async () => {
    if (!memory) throw new Error('DATABASE_URL is required for the memory e2e test');
    const item = await memory.remember({
      projectId,
      content: 'We deploy by building images on the server with docker compose, no registry.',
      type: 'DECISION',
    });
    createdId = item.id;

    const hits = await memory.search(projectId, 'how do we deploy the app', 5);
    expect(hits.some((h) => h.item.id === item.id)).toBe(true);
  });
});
