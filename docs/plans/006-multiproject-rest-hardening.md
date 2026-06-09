# 006 — Multi-Project, REST API (Knowledge/Memory), Hardening

- **Status:** Done
- **Phase:** 7
- **Связи:** [ROADMAP](../roadmap/ROADMAP.md) · [005-knowledge-memory](005-knowledge-memory.md) · [Claude.md](../../Claude.md)

## Goal
Полноценная мульти-проектность через REST: управление проектами, project-scoped доступ к
памяти/знаниям, проверка владения, базовый rate limiting (hardening).

## Scope
**In:**
- `ProjectsModule` (REST): CRUD проектов, owner-scoped (`POST/GET/GET :id/DELETE /api/v1/projects`).
- Project-scoped REST для памяти/знаний поверх `@brain-dock/knowledge`
  (`/projects/:projectId/memory`, `/projects/:projectId/knowledge` + `/search`).
- Проверка владения проектом (owner или ADMIN).
- `RateLimitGuard` (fixed-window, in-memory) — глобальный, конфигурируемый через env.
- `EMBEDDER` в env (консистентность провайдера эмбеддингов между API и MCP).

**Out (далее):** multi-repo индексация, метрики/нагрузочное тестирование, Redis-backed rate limit,
документы (md/pdf/docx), MCP resources/prompts, update/delete для knowledge.

## Этапы
- [x] env: `EMBEDDER`, `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`.
- [x] `FixedWindowLimiter` (чистый) + `RateLimitGuard` (APP_GUARD) + unit-тест.
- [x] `ProjectsModule` (service/controller/dto) + ownership (owner/ADMIN).
- [x] Memory/Knowledge REST (project-scoped) — providers поверх `@brain-dock/knowledge`.
- [x] Live: `scripts/smoke-rest.sh` (project → memory → search); ownership 403; rate-limit 429.
- [x] Тесты/typecheck/Biome; docs/api, ROADMAP, Claude.md.

## Definition of Done — ✅ выполнено
- Создание проекта, добавление/поиск памяти и знаний через REST работают вживую с auth+ownership
  (проверено: project 201, memory add/search, knowledge add/search, чужой → 403).
- Rate limit срабатывает (429 при превышении); unit-тест лимитера зелёный.
- 44 теста/typecheck(11)/Biome зелёные; документация обновлена.

## Отложено
- Multi-repo индексация, метрики/нагрузочное тестирование, Redis-backed rate limit,
  документы (md/pdf/docx), Swagger/OpenAPI, update/delete для knowledge/memory.
