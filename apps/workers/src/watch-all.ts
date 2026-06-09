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
import { startWatchReindexer } from './watch-reindex';
import { repositoriesToWatchTargets } from './watch-targets';

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
const repos = await prisma.repository.findMany(projectId ? { where: { projectId } } : undefined);
const targets = repositoriesToWatchTargets(repos);

if (targets.length === 0) {
  console.error(`[watch-all] no repositories found${projectId ? ` for project ${projectId}` : ''}`);
  process.exit(0);
}

const handles = targets.map((target) =>
  startWatchReindexer({
    ...target,
    embedder,
    qdrantUrl,
    onReindex: (r) =>
      console.error(
        `[watch-all:${target.repo}] reindex: files=${r.files} changed=${r.changedFiles} removed=${r.removedFiles} chunks=${r.chunks}`,
      ),
  }),
);

console.error(
  `[brain-dock:watch-all] watching ${targets.length} repo(s): ${targets.map((t) => t.repo).join(', ')}`,
);

const shutdown = () => {
  for (const handle of handles) handle.stop();
  void prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
