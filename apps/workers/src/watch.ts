#!/usr/bin/env bun
// Watch a project and incrementally reindex on change.
// Usage: PROJECT_ROOT=apps/api/src EMBEDDER=ollama bun apps/workers/src/watch.ts
import {
  DeterministicEmbeddingProvider,
  type EmbeddingProvider,
  OllamaEmbeddingProvider,
} from '@brain-dock/embedding';
import { startWatchReindexer } from './watch-reindex';

const rootDir = process.env.PROJECT_ROOT ?? process.cwd();

const embedder: EmbeddingProvider =
  process.env.EMBEDDER === 'ollama'
    ? new OllamaEmbeddingProvider({
        url: process.env.OLLAMA_URL ?? 'http://localhost:11434',
        model: process.env.EMBEDDING_MODEL ?? 'nomic-embed-text',
        dimensions: 768,
      })
    : new DeterministicEmbeddingProvider(256);

startWatchReindexer({
  rootDir,
  projectId: process.env.PROJECT_ID ?? 'default',
  collection: process.env.COLLECTION ?? 'code',
  qdrantUrl: process.env.QDRANT_URL ?? 'http://localhost:16333',
  embedder,
  onReindex: (r) =>
    console.error(
      `[watch] reindex: files=${r.files} changed=${r.changedFiles} removed=${r.removedFiles} chunks=${r.chunks}`,
    ),
});

console.error(`[brain-dock:watch] watching ${rootDir}`);
