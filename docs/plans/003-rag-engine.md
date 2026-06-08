# 003 — Embedding, Vector Storage, Hybrid Search, Context Engine

- **Status:** In progress (Phase 3 — этот заход; Phase 4 Context Engine — далее)
- **Phase:** 3–4
- **Связи:** [ROADMAP](../roadmap/ROADMAP.md) · [002-indexer](002-indexer.md) · [Claude.md](../../Claude.md) §3,§14

## Решения (этот заход, sensible defaults)
- `EmbeddingProvider` — общий интерфейс `embed(texts[]) → number[][]` + `model`/`dimensions`.
  Две реализации: **OllamaEmbeddingProvider** (`/api/embed`, `nomic-embed-text`, 768d, батчи) и
  **DeterministicEmbeddingProvider** (хэш-векторы, оффлайн/тесты — позволяет проверить весь
  pipeline без скачивания модели).
- **Qdrant** (`@qdrant/js-client-rest`): коллекция `code` (одна на текущую модель), distance Cosine,
  size = `provider.dimensions`. Изоляция проектов — payload `projectId` + фильтр. Point id — UUID
  из sha256 чанка. Версия модели — в payload; смена модели/размерности → новая коллекция.
- **Гибрид (мост):** vector + лёгкий keyword-boost (по токенам в payload.text). Полноценный
  BM25/full-text и AST/knowledge-слияние — Phase 4.

## Разбиение
- **Phase 3 (этот заход):** embedding-провайдеры, Qdrant-стор, ingestion-pipeline
  (indexer → embed → Qdrant), vector+keyword поиск, BullMQ-воркер (закрыть риск BullMQ-на-Bun).
- **Phase 4 (далее):** intent detection, re-ranking, compression, Context Builder; AST/knowledge/metadata-слияние.

## Goal
Локальные эмбеддинги, векторное хранилище, гибридный поиск и автоматический сбор контекста:
`Query → Intent → Hybrid Search → ReRank → Compression → Context Builder`.

## Scope
**In:**
- `EmbeddingProvider` (интерфейс) + реализация Ollama (`nomic-embed-text`); batch + кэш;
  версия модели/размерности хранится рядом с вектором.
- Qdrant: коллекции (`code`, `functions`, `classes`, `documents`, `knowledge`, `memory`, ...),
  схема payload, фильтрация по `project_id`.
- Воркеры BullMQ: `EmbeddingWorker`, `IndexWorker` (поверх плана 002).
- Hybrid Search: keyword + vector + AST + knowledge + metadata; re-ranking; context compression.
- Intent detection (debug/modify/refactor/explore) → Context Builder.

**Out:** MCP-обёртка над поиском (план 004); Knowledge Base/Memory как продукт (Phase 6).

## Этапы
- [x] `EmbeddingProvider` + Ollama-реализация (+ DeterministicEmbeddingProvider для оффлайн/тестов); версия модели в payload.
- [x] Qdrant-адаптер (`packages/storage`): коллекция, upsert, фильтр по projectId, payload-схема, UUID-id.
- [x] Pipeline индексации end-to-end (`@brain-dock/search` IngestionService); BullMQ `IndexWorker`.
- [x] Keyword + vector поиск (гибрид-мост `0.7·vector + 0.3·keyword`).
- [ ] **Phase 4:** AST/knowledge/metadata-слияние; re-ranking + compression; intent detection; Context Builder.
- [x] Тесты: unit (provider/ranker/uuid), live e2e (ingest→Qdrant→search на `apps/api`), BullMQ-smoke.
- [x] Документация docs/embedding, docs/rag, docs/backend (BullMQ-заметка); ROADMAP, Claude.md.

## Риски
- Смена модели/размерности ломает индекс. → Версионирование коллекций, реиндекс по версии.
- Качество ранжирования. → Метрики на эталонных запросах, итеративная настройка.

## Definition of Done
- **Phase 3 — ✅ выполнено:** индекс → Qdrant работает; гибридный поиск возвращает релевантный
  контекст (проверено вживую с deterministic и реальным Ollama `nomic-embed-text`); смена модели —
  через новую коллекцию; BullMQ-на-Bun закрыт; тесты/typecheck/Biome зелёные; документация обновлена.
- **Phase 4 — далее:** Context Engine (intent/rerank/compression/builder), полноценный hybrid fusion.
