#!/usr/bin/env bun
// Watch every repository of a project (or all projects) and incrementally reindex on change.
// Repositories are read from Postgres (see plan 016); the set is a snapshot taken at startup —
// repos added later are picked up on restart.
// Usage: DATABASE_URL=... [PROJECT_ID=...] EMBEDDER=ollama bun --no-addons apps/workers/src/watch-all.ts
import { createPrismaClient } from '@brain-dock/db';
import {
  DeterministicEmbeddingProvider,
  type EmbeddingProvider,
  OllamaEmbeddingProvider,
} from '@brain-dock/embedding';
import { startWatchReindexer, type WatchHandle } from './watch-reindex';
import {
  reconcileWatchTargets,
  repositoriesToWatchTargets,
  type WatchTarget,
} from './watch-targets';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('[watch-all] DATABASE_URL is required');
  process.exit(1);
}

const embedder: EmbeddingProvider =
  process.env.EMBEDDER === 'ollama'
    ? new OllamaEmbeddingProvider({
        url: process.env.OLLAMA_URL ?? 'http://localhost:11434',
        model: process.env.EMBEDDING_MODEL ?? 'nomic-embed-text',
        dimensions: 768,
      })
    : new DeterministicEmbeddingProvider(256);

const qdrantUrl = process.env.QDRANT_URL ?? 'http://localhost:16333';
const projectId = process.env.PROJECT_ID;

const prisma = createPrismaClient(databaseUrl);
// Active watchers keyed by repositoryId, so the desired set can be reconciled against them.
const active = new Map<string, { target: WatchTarget; handle: WatchHandle }>();

function startTarget(target: WatchTarget): void {
  const handle = startWatchReindexer({
    ...target,
    embedder,
    qdrantUrl,
    onReindex: (r) =>
      console.error(
        `[watch-all:${target.repo}] reindex: files=${r.files} changed=${r.changedFiles} removed=${r.removedFiles} chunks=${r.chunks}`,
      ),
  });
  active.set(target.repositoryId, { target, handle });
}

function apply(desired: WatchTarget[]): void {
  const diff = reconcileWatchTargets(
    desired,
    new Map([...active].map(([id, v]) => [id, v.target])),
  );
  for (const id of [...diff.toStop, ...diff.toRestart.map((t) => t.repositoryId)]) {
    active.get(id)?.handle.stop();
    active.delete(id);
  }
  for (const target of [...diff.toRestart, ...diff.toStart]) startTarget(target);
  if (diff.toStart.length + diff.toStop.length + diff.toRestart.length > 0) {
    console.error(
      `[watch-all] +${diff.toStart.length} -${diff.toStop.length} ~${diff.toRestart.length} → watching ${active.size} repo(s): ${[...active.values()].map((v) => v.target.repo).join(', ')}`,
    );
  }
}

async function loadTargets(): Promise<WatchTarget[]> {
  const repos = await prisma.repository.findMany(projectId ? { where: { projectId } } : undefined);
  return repositoriesToWatchTargets(repos);
}

const initial = await loadTargets();
if (initial.length === 0) {
  console.error(`[watch-all] no repositories found${projectId ? ` for project ${projectId}` : ''}`);
}
apply(initial);
console.error(
  `[brain-dock:watch-all] watching ${active.size} repo(s): ${[...active.values()].map((v) => v.target.repo).join(', ')}`,
);

// Optional hot re-subscribe: poll the DB and reconcile the watcher set. 0 = startup snapshot only.
const pollMs = Number(process.env.WATCH_POLL_MS ?? 0);
const poll =
  pollMs > 0
    ? setInterval(() => {
        void loadTargets()
          .then(apply)
          .catch((e) => console.error(`[watch-all] poll failed: ${(e as Error).message}`));
      }, pollMs)
    : null;
if (poll) console.error(`[watch-all] hot re-subscribe every ${pollMs}ms`);

const shutdown = () => {
  if (poll) clearInterval(poll);
  for (const { handle } of active.values()) handle.stop();
  void prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
