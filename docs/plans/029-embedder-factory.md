# 029 — Общая фабрика эмбеддера (+ фикс воркера)

**Status:** Done
**Фаза:** First-launch hardening
**Связи:** [003-rag-engine](003-rag-engine.md) · [014-redis-rate-limit](014-redis-rate-limit.md)

## Проблема
`apps/workers/src/index.ts` **жёстко создаёт `OllamaEmbeddingProvider` (768d)**, игнорируя
`EMBEDDER`. api и mcp выбирают провайдер по `EMBEDDER` (ollama 768 / deterministic 256). Если
запустить с `EMBEDDER=deterministic`, воркер всё равно эмбеддит через Ollama (768d) и пишет в ту
же Qdrant-коллекцию `code`, куда api писал 256d — **рассинхрон размерностей/порча индекса**.
Документация (`docs/deployment`, env) явно требует, чтобы провайдер совпадал между сервисами.

## Goal
Единая фабрика эмбеддера в `@brain-dock/embedding`, используемая api/mcp/workers; воркер чтит `EMBEDDER`.

## Scope
**In:**
- `createEmbedder(config)` + `embedderConfigFromEnv(env)` в `@brain-dock/embedding`
  (ollama→768, deterministic→256).
- api `embedder.factory`, mcp `makeEmbedder`, workers entry — через неё.
- Тест фабрики.

**Out:** кэш эмбеддингов; смена размерности deterministic.

## Этапы
- [x] `createEmbedder`/`embedderConfigFromEnv` + тест.
- [x] Перевести api/mcp/workers на фабрику.
- [x] CI + commit/push.

## Definition of Done
- Воркер использует провайдер по `EMBEDDER` (одинаковая размерность во всех сервисах).
- `bun run ci` зелёный.
</content>
