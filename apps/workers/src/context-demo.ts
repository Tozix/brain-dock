#!/usr/bin/env bun
// Context Engine demo (Phase 4): ingest → build budget-bounded context for a query.
// Requires Qdrant up. Usage: bun apps/workers/src/context-demo.ts ["query"]   (EMBEDDER=ollama for real model)
import {
  DeterministicEmbeddingProvider,
  type EmbeddingProvider,
  OllamaEmbeddingProvider,
} from '@brain-dock/embedding';
import { ContextEngine, IngestionService, SearchService } from '@brain-dock/search';
import { QdrantStore } from '@brain-dock/storage';

const url = process.env.QDRANT_URL ?? 'http://localhost:16333';
const collection = 'code_demo';
const projectId = 'brain-dock';

const embedder: EmbeddingProvider =
  process.env.EMBEDDER === 'ollama'
    ? new OllamaEmbeddingProvider({
        url: process.env.OLLAMA_URL ?? 'http://localhost:11434',
        model: process.env.EMBEDDING_MODEL ?? 'nomic-embed-text',
        dimensions: 768,
      })
    : new DeterministicEmbeddingProvider(256);

const store = new QdrantStore({ url });
await store.deleteCollection(collection).catch(() => {});
await new IngestionService(embedder, store).ingestRepository('apps/api/src', {
  projectId,
  collection,
});

const query = process.argv[2] ?? 'why does jwt authentication fail';
const ctx = await new ContextEngine(new SearchService(embedder, store)).buildContext(query, {
  projectId,
  collection,
  limit: 5,
  maxChars: 4000,
});

console.log(
  `intent=${ctx.intent}  candidates=${ctx.stats.candidates}  included=${ctx.stats.included}  chars=${ctx.stats.chars}\n`,
);
console.log(ctx.text);
