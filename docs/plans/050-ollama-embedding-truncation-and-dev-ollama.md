# 050 — Ollama-эмбеддинг: обрезка под контекст модели (прод-фикс поиска) + dev на ollama

**Status:** Done (фикс) · dev-настройка — локально
**Фаза:** Production readiness / search quality
**Дата:** 2026-06-10
**Связи:** [003-rag-engine](003-rag-engine.md) · [029-embedder-factory](029-embedder-factory.md) ·
[046-index-uploaded-files-no-git](046-index-uploaded-files-no-git.md)

## Проблема (найдено при боевом тесте на ollama)
С `EMBEDDER=ollama` индексация падала: `Ollama embed failed (400): the input length exceeds the
context length`. Крупные символы/чанки превышали контекст `nomic-embed-text` (~2048 токенов), и
**весь батч (и вся индексация) валились**. С `deterministic` бага не было (хэш-вектор без лимита),
поэтому раньше не всплывало. Это блокировало прод-режим (реальную семантику).

## Сделано
- `OllamaEmbeddingProvider`: вход обрезается до `maxChars` (по умолчанию **6000** символов ≈ безопасно
  под 2048 токенов для плотного кода) перед отправкой в `/api/embed`. Опция `maxChars` конфигурируема.
  Регресс-тест (мок `fetch`): длинный вход усечён, короткий — нет.

## Проверено (вживую, ollama 768d)
Проиндексировал `apps/api/src` реальными эмбеддингами и прогнал семантические запросы — релевантность
отличная:
- «API key authentication» → AuthModule / ApiKeysController / ApiKeysService;
- «rate limiting requests» → RateLimitGuard / *Limiter;
- «health readiness check» → HealthController / ReadinessReport / HealthService;
- «index uploaded files without git» → IndexingController / IndexingService / IndexingModule.
(deterministic давал нерелевантную кашу — что и ожидаемо для offline-режима.) `bun run ci` зелёный.

## Dev-стек на ollama (боевой функционал локально)
- `.env`: `EMBEDDER=ollama`, `COLLECTION=code_ollama` (новая коллекция 768d — не конфликтует со старой
  256d `code`; все сервисы консистентны, т.к. `dev:stack` экспортит общий env).
- Порядок: `ollama pull nomic-embed-text` → перезапустить `bun run dev:stack` → **переиндексировать**
  проект (аплоад → ollama-эмбеддинг в `code_ollama`) → `search_*`/`generate_context` семантические.

## Дальше
- Прод-дефолт `EMBEDDER=ollama` + readiness-проверка модели; прогрев модели (первый embed ~секунды).
- Опционально: чанкинг с учётом токен-лимита (сейчас — безопасная обрезка на стороне провайдера).

## Definition of Done
- Индексация на ollama не падает на больших символах; семантический поиск релевантен; `bun run ci` зелёный.
