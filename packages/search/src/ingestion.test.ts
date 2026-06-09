import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DeterministicEmbeddingProvider } from '@brain-dock/embedding';
import type { QdrantFilter, QdrantStore, VectorPoint } from '@brain-dock/storage';
import { IngestionService } from './ingestion';

/** In-memory fake store recording upserted paths and deleted-by-path filters. */
class FakeStore {
  upsertedPaths: string[][] = [];
  deletedPaths: string[] = [];
  async ensureCollection(): Promise<void> {}
  async upsert(_name: string, points: VectorPoint[]): Promise<void> {
    this.upsertedPaths.push(points.map((p) => String((p.payload as { path: string }).path)));
  }
  async deleteByFilter(_name: string, filter: QdrantFilter): Promise<void> {
    const value = filter.must?.[0]?.match.value;
    if (typeof value === 'string') this.deletedPaths.push(value);
  }
}

const opts = { projectId: 'p', collection: 'code' };

describe('IngestionService.ingestIncremental', () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'bd-ingest-'));
    writeFileSync(join(dir, 'a.ts'), 'export class A {}\n');
    writeFileSync(join(dir, 'b.ts'), 'export class B {}\n');
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('embeds everything on the first pass, then only changed files', async () => {
    const store = new FakeStore();
    const service = new IngestionService(
      new DeterministicEmbeddingProvider(64),
      store as unknown as QdrantStore,
    );

    const first = await service.ingestIncremental(dir, opts);
    expect(first.changedFiles).toBe(2);
    expect(first.removedFiles).toBe(0);

    // Change only a.ts.
    writeFileSync(join(dir, 'a.ts'), 'export class A { x = 1; }\n');
    store.upsertedPaths = [];
    store.deletedPaths = [];

    const second = await service.ingestIncremental(dir, { ...opts, previous: first.index });
    expect(second.changedFiles).toBe(1);
    expect(second.removedFiles).toBe(0);
    expect(store.upsertedPaths.flat()).toEqual(['a.ts']); // b.ts not re-embedded
    expect(store.deletedPaths).toContain('a.ts');

    // Remove b.ts.
    rmSync(join(dir, 'b.ts'));
    store.upsertedPaths = [];
    store.deletedPaths = [];

    const third = await service.ingestIncremental(dir, { ...opts, previous: second.index });
    expect(third.changedFiles).toBe(0);
    expect(third.removedFiles).toBe(1);
    expect(store.deletedPaths).toContain('b.ts');
  });
});
