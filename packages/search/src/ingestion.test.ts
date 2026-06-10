import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DeterministicEmbeddingProvider } from '@brain-dock/embedding';
import { RepositoryIndexer } from '@brain-dock/indexer';
import type { QdrantFilter, QdrantStore, VectorPoint } from '@brain-dock/storage';
import { IngestionService, scopedPointId } from './ingestion';

/** In-memory fake store recording upserted paths and deleted-by-path filters. */
class FakeStore {
  upsertedPaths: string[][] = [];
  deletedPaths: string[] = [];
  async ensureCollection(): Promise<void> {}
  async upsert(_name: string, points: VectorPoint[]): Promise<void> {
    this.upsertedPaths.push(points.map((p) => String((p.payload as { path: string }).path)));
  }
  async listPointIds(): Promise<string[]> {
    return [];
  }
  async deletePoints(): Promise<void> {}
  async deleteByFilter(_name: string, filter: QdrantFilter): Promise<void> {
    const cond = filter.must?.find((m) => m.key === 'path')?.match;
    if (cond && 'value' in cond && typeof cond.value === 'string') {
      this.deletedPaths.push(cond.value);
    }
  }
}

/** Fake store with real point storage — enough to verify scoped orphan pruning. */
class FakePointStore {
  points = new Map<string, Record<string, unknown>>();
  async ensureCollection(): Promise<void> {}
  async upsert(_name: string, pts: VectorPoint[]): Promise<void> {
    for (const p of pts) this.points.set(p.id, p.payload);
  }
  async listPointIds(_name: string, options?: { filter?: QdrantFilter }): Promise<string[]> {
    const must = options?.filter?.must ?? [];
    return [...this.points.entries()]
      .filter(([, payload]) =>
        must.every((m) => 'value' in m.match && payload[m.key] === m.match.value),
      )
      .map(([id]) => id);
  }
  async deletePoints(_name: string, ids: string[]): Promise<void> {
    for (const id of ids) this.points.delete(id);
  }
  async deleteByFilter(): Promise<void> {}
  payloadsFor(projectId: string): Array<Record<string, unknown>> {
    return [...this.points.values()].filter((p) => p.projectId === projectId);
  }
}

const opts = { projectId: 'p', collection: 'code' };

describe('scopedPointId', () => {
  it('is deterministic and uuid-shaped', () => {
    expect(scopedPointId('p1', 'r1', 'chunk')).toBe(scopedPointId('p1', 'r1', 'chunk'));
    expect(scopedPointId('p1', 'r1', 'chunk')).toMatch(
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,
    );
  });

  it('differs across projects and repos for the same chunk', () => {
    const base = scopedPointId('p1', 'r1', 'chunk');
    expect(scopedPointId('p2', 'r1', 'chunk')).not.toBe(base);
    expect(scopedPointId('p1', 'r2', 'chunk')).not.toBe(base);
  });
});

describe('IngestionService.ingestIndex — orphan pruning', () => {
  const indexOf = (files: Array<{ path: string; content: string }>) =>
    new RepositoryIndexer().indexFiles('/repo', files);
  const a = { path: 'a.ts', content: 'export class A {}\n' };
  const b = { path: 'b.ts', content: 'export class B {}\n' };

  it('re-ingesting a smaller index deletes stale points but never another tenant', async () => {
    const store = new FakePointStore();
    const service = new IngestionService(
      new DeterministicEmbeddingProvider(8),
      store as unknown as QdrantStore,
    );

    // Two tenants share the collection.
    await service.ingestIndex(indexOf([a, b]), { projectId: 'p1', collection: 'code' });
    await service.ingestIndex(indexOf([a]), { projectId: 'p2', collection: 'code' });
    expect(store.payloadsFor('p1')).toHaveLength(2);
    expect(store.payloadsFor('p2')).toHaveLength(1);

    // p1 drops b.ts — its orphan goes away, p2 is untouched.
    await service.ingestIndex(indexOf([a]), { projectId: 'p1', collection: 'code' });
    expect(store.payloadsFor('p1').map((p) => p.path)).toEqual(['a.ts']);
    expect(store.payloadsFor('p2')).toHaveLength(1);
  });

  it('scopes pruning by repo as well', async () => {
    const store = new FakePointStore();
    const service = new IngestionService(
      new DeterministicEmbeddingProvider(8),
      store as unknown as QdrantStore,
    );

    await service.ingestIndex(indexOf([a]), { projectId: 'p', collection: 'code', repo: 'r1' });
    await service.ingestIndex(indexOf([b]), { projectId: 'p', collection: 'code', repo: 'r2' });
    // Each repo keeps its own points despite sharing projectId and collection.
    expect([...store.points.values()].map((p) => `${p.repo}:${p.path}`).sort()).toEqual([
      'r1:a.ts',
      'r2:b.ts',
    ]);
  });
});

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
