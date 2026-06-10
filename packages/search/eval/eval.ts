/**
 * Search-quality eval harness (`bun run search:eval`).
 *
 * Indexes this repository's `apps/*`/`packages/*` sources with the deterministic embedder into a
 * throwaway Qdrant collection, runs every golden query through `SearchService.search`, and reports
 * nDCG@10 / MRR / Recall@5 against the expected files (see `golden.json`). The collection is
 * deleted afterwards. Requires Qdrant on `QDRANT_URL` (default http://localhost:16333).
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DeterministicEmbeddingProvider } from '@brain-dock/embedding';
import { RepositoryIndexer } from '@brain-dock/indexer';
import { IngestionService, SearchService } from '@brain-dock/search';
import { QdrantStore } from '@brain-dock/storage';

interface GoldenCase {
  query: string;
  expectedPaths: string[];
}

interface CaseMetrics {
  query: string;
  ndcg10: number;
  mrr: number;
  recall5: number;
  firstHit: number | null;
}

const TOP_K = 10;
const RECALL_K = 5;
const PROJECT_ID = 'search-eval';
const REPO = 'brain-dock';

// --- metrics (binary relevance) ---------------------------------------------------------------

/** Collapse chunk-level results to unique file paths, best rank first. */
function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of paths) {
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

function ndcgAt(ranked: string[], expected: Set<string>, k: number): number {
  let dcg = 0;
  for (let i = 0; i < Math.min(k, ranked.length); i++) {
    const path = ranked[i];
    if (path !== undefined && expected.has(path)) dcg += 1 / Math.log2(i + 2);
  }
  let idcg = 0;
  for (let i = 0; i < Math.min(k, expected.size); i++) idcg += 1 / Math.log2(i + 2);
  return idcg > 0 ? dcg / idcg : 0;
}

/** Reciprocal rank of the first relevant path (0 when nothing relevant is returned). */
function reciprocalRank(ranked: string[], expected: Set<string>): number {
  for (let i = 0; i < ranked.length; i++) {
    const path = ranked[i];
    if (path !== undefined && expected.has(path)) return 1 / (i + 1);
  }
  return 0;
}

function recallAt(ranked: string[], expected: Set<string>, k: number): number {
  if (expected.size === 0) return 0;
  let found = 0;
  for (const path of ranked.slice(0, k)) {
    if (expected.has(path)) found++;
  }
  return found / expected.size;
}

function firstHitRank(ranked: string[], expected: Set<string>): number | null {
  const idx = ranked.findIndex((p) => expected.has(p));
  return idx === -1 ? null : idx + 1;
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

// --- harness -----------------------------------------------------------------------------------

const evalDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(evalDir, '..', '..', '..');
const qdrantUrl = process.env.QDRANT_URL ?? 'http://localhost:16333';
const collection = `search_eval_${Date.now()}`;

const golden = JSON.parse(readFileSync(join(evalDir, 'golden.json'), 'utf8')) as {
  cases: GoldenCase[];
};

const include = (path: string): boolean =>
  (path.startsWith('apps/') || path.startsWith('packages/')) &&
  path.includes('/src/') &&
  !path.includes('.test.') &&
  !path.includes('.spec.');

const embedder = new DeterministicEmbeddingProvider(256);
const store = new QdrantStore({ url: qdrantUrl });
const ingestion = new IngestionService(embedder, store);
const search = new SearchService(embedder, store);

console.log(`Indexing ${repoRoot} into ${qdrantUrl} :: ${collection} …`);
const index = new RepositoryIndexer().index(repoRoot, { include });

try {
  const report = await ingestion.ingestIndex(index, {
    projectId: PROJECT_ID,
    collection,
    repo: REPO,
  });
  console.log(`Ingested ${report.files} files → ${report.chunks} chunks.\n`);

  const perCase: CaseMetrics[] = [];
  for (const goldenCase of golden.cases) {
    const results = await search.search(goldenCase.query, {
      projectId: PROJECT_ID,
      collection,
      limit: TOP_K,
    });
    const ranked = uniquePaths(results.map((r) => r.path));
    const expected = new Set(goldenCase.expectedPaths);
    perCase.push({
      query: goldenCase.query,
      ndcg10: ndcgAt(ranked, expected, TOP_K),
      mrr: reciprocalRank(ranked, expected),
      recall5: recallAt(ranked, expected, RECALL_K),
      firstHit: firstHitRank(ranked, expected),
    });
  }

  const header = `${'query'.padEnd(48)} ${'nDCG@10'.padStart(8)} ${'MRR'.padStart(6)} ${'R@5'.padStart(6)} ${'hit@'.padStart(5)}`;
  console.log(header);
  console.log('-'.repeat(header.length));
  for (const m of perCase) {
    const name = m.query.length > 47 ? `${m.query.slice(0, 44)}…` : m.query;
    console.log(
      `${name.padEnd(48)} ${m.ndcg10.toFixed(3).padStart(8)} ${m.mrr.toFixed(3).padStart(6)} ` +
        `${m.recall5.toFixed(3).padStart(6)} ${String(m.firstHit ?? '—').padStart(5)}`,
    );
  }

  const summary = {
    collection,
    cases: perCase.length,
    files: report.files,
    chunks: report.chunks,
    ndcg10: Number(mean(perCase.map((m) => m.ndcg10)).toFixed(4)),
    mrr: Number(mean(perCase.map((m) => m.mrr)).toFixed(4)),
    recall5: Number(mean(perCase.map((m) => m.recall5)).toFixed(4)),
    misses: perCase.filter((m) => m.firstHit === null).map((m) => m.query),
  };
  console.log('-'.repeat(header.length));
  console.log(
    `${'MEAN'.padEnd(48)} ${summary.ndcg10.toFixed(3).padStart(8)} ` +
      `${summary.mrr.toFixed(3).padStart(6)} ${summary.recall5.toFixed(3).padStart(6)}`,
  );
  console.log(`\nJSON: ${JSON.stringify(summary)}`);
} finally {
  await store.deleteCollection(collection).catch((error: unknown) => {
    console.warn(`Failed to delete eval collection ${collection}:`, error);
  });
}
