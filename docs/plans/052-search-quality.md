# 052 — Качество поиска: eval-harness, префиксы nomic, суб-чанкинг, настоящий hybrid (BM25+RRF)

**Status:** Done
**Фаза:** Search quality
**Дата:** 2026-06-10
**Источник:** исследование аналогов (Cursor/Claude Context, Qdrant Query API, Aider, model card
nomic-embed-text) + находки аудита (план 051).
**Связи:** [003-rag-engine](003-rag-engine.md) · [020-score-normalization](020-score-normalization.md) ·
[050-ollama-embedding-truncation](050-ollama-embedding-truncation-and-dev-ollama.md)

## Цель
Поднять релевантность поиска hosted MCP измеримо: точные совпадения идентификаторов должны
ранжироваться, большие классы — индексироваться целиком, эффект каждого изменения — виден в метриках.

## Этапы
- [x] **Eval-harness**: golden set 40 пар «запрос → ожидаемые файлы» по репо brain-dock
  (`packages/search/eval/`), nDCG@10 / MRR / Recall@5; `bun run search:eval`; baseline зафиксирован.
- [x] **Task-префиксы nomic-embed-text**: документы — `search_document: `, запросы —
  `search_query: ` (`EmbeddingProvider.embedQuery`, обратно совместимо). Обрезка контента до
  maxChars — до добавления префикса (префикс всегда целый). `model` → `…+prefixed` в payload.
  Deterministic — без префиксов (тесты стабильны).
- [x] **Суб-чанкинг крупных символов**: `SUBCHUNK_THRESHOLD = 6000` (конфигурируемо); чанк-«шапка»
  класса + чанк на метод с breadcrumb `file > Class` + сигнатура; детерминированные id.
- [x] **Hybrid BM25 + dense + RRF (Qdrant Query API)**: новые коллекции — named `dense` + sparse
  `bm25` (modifier: idf), server-side RRF (`hybridQuery` с prefetch); code-aware токенизатор
  (camelCase/snake_case + оригинал, fnv1a, k1=1.2 b=0.75). Legacy-коллекции автоматически
  распознаются и работают в dense-only (+keyword-boost) до реиндекса.
- [x] **Payload-индексы**: `projectId` (keyword, is_tenant), `repo`, `path` — создаются в
  `ensureCollection`, «already exists» терпим.
- [x] **RRF в search_everywhere**: `w_src/(60+rank)`, веса code 1.0 / knowledge 0.9 / docs 0.8 /
  memory 0.7.

## Результаты eval (40 запросов, deterministic-эмбеддер, реальный Qdrant)

| Метрика | Baseline | После | Δ |
|---|---|---|---|
| nDCG@10 | 0.543 | **0.620** | +0.077 |
| MRR | 0.551 | **0.561** | +0.010 |
| Recall@5 | 0.604 | **0.813** | +0.209 |
| Полных промахов | 14 | **3** | −11 |

Точные идентификаторы (`resolvePrincipal`, `roles guard`, `audit log`, `knowledge ADR`…), которых
раньше не было в выдаче вовсе, теперь в топ-5 — эффект BM25-ветки. С ollama-префиксами dense-ветка
дополнительно усилится (deterministic меряет в основном BM25/чанкинг).

## Definition of Done
- [x] Eval-метрики до/после зафиксированы; точные идентификаторы в топе; промахи 14 → 3.
- [x] Старые коллекции не ломаются (dense-only fallback); `bun run ci` зелёный.
