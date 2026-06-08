#!/usr/bin/env bun
// End-to-end RAG pipeline demo (Phase 3): index → embed → Qdrant → search.
// Uses the offline DeterministicEmbeddingProvider, so it runs without Ollama.
// Requires Qdrant up (`bun run infra:up`). Usage: bun apps/workers/src/rag-demo.ts ["query"]
import {
  DeterministicEmbeddingProvider,
  type EmbeddingProvider,
  OllamaEmbeddingProvider,
} from '@brain-dock/embedding';
import { IngestionService, SearchService } from '@brain-dock/search';
import { QdrantStore } from '@brain-dock/storage';

const url = process.env.QDRANT_URL ?? 'http://localhost:16333';
const collection = 'code_demo';
const projectId = 'brain-dock';

// EMBEDDER=ollama uses the real local model; otherwise the offline deterministic provider.
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

const report = await new IngestionService(embedder, store).ingestRepository('apps/api/src', {
  projectId,
  collection,
});
console.log(
  `ingested: ${report.files} files, ${report.chunks} chunks → collection "${collection}"`,
);

const query = process.argv[2] ?? 'jwt access token authentication guard';
const results = await new SearchService(embedder, store).search(query, {
  projectId,
  collection,
  limit: 5,
});

console.log(`\nquery: "${query}"`);
for (const r of results) {
  console.log(
    `  ${r.score.toFixed(3)}  ${r.role.padEnd(10)} ${r.symbol}  (${r.path}:${r.startLine})`,
  );
}
