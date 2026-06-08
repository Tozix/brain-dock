# 003 — Embedding, Vector Storage, Hybrid Search, Context Engine

- **Status:** Draft
- **Phase:** 3–4
- **Связи:** [ROADMAP](../roadmap/ROADMAP.md) · [002-indexer](002-indexer.md) · [Claude.md](../../Claude.md) §3,§14

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
- [ ] `EmbeddingProvider` + Ollama-реализация; embedding-кэш; версия модели.
- [ ] Qdrant-адаптер (`packages/storage`): коллекции, upsert, фильтры, payload-схемы.
- [ ] Воркеры embedding/index; pipeline индексации end-to-end.
- [ ] Keyword + vector поиск; затем AST/knowledge/metadata; слияние результатов.
- [ ] Re-ranking + compression; intent detection; Context Builder.
- [ ] Тесты: unit (provider/ranker), integration (Qdrant), e2e (query → context).
- [ ] Документация docs/embedding, docs/rag, docs/database; ROADMAP, Claude.md.

## Риски
- Смена модели/размерности ломает индекс. → Версионирование коллекций, реиндекс по версии.
- Качество ранжирования. → Метрики на эталонных запросах, итеративная настройка.

## Definition of Done
- Индекс → Qdrant работает; гибридный поиск возвращает релевантный контекст.
- Смена модели обрабатывается через версию коллекции без «тихой» порчи.
- Тесты зелёные; документация обновлена.
