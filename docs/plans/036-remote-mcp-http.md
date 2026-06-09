# 036 — Удалённый MCP по HTTP (хостинговая модель)

**Status:** Done
**Фаза:** Hosted product
**Связи:** [004-mcp-server](004-mcp-server.md) · [033-api-key-auth](033-api-key-auth.md) · [009-unified-search](009-unified-search.md)

## Контекст / модель
brain-dock — **хостимый сервис** (как vexp.dev): сервер крутится у нас, у пользователя локально
ничего не запускается. Пользователь получает **API-ключ (лицензия, = пользователь)** и подключает
MCP-клиент к **нашему удалённому MCP-эндпоинту** по HTTP. У пользователя может быть **несколько
проектов**; проект выбирается per-request заголовком `X-Project` (id или slug).

## Решения
- Транспорт: **Streamable HTTP** (`WebStandardStreamableHTTPServerTransport`, stateless,
  `enableJsonResponse`) на `Bun.serve`.
- Auth: `Authorization: Bearer bd_<key>` → пользователь (по `keyHash`); проект — `X-Project`.
- **Только персистентные tools** (работают из Qdrant+Postgres, без локальных файлов):
  `list_projects`, `search_code`, `generate_context`, `search_everywhere`, `remember`,
  `search_memory`, `save_knowledge`, `search_knowledge`, `save_document`, `search_docs`.
- Структурные/граф-tools (нужен серверный индекс символов) — **отдельный эпик** (план 037+).

## Scope
**In:** `apps/mcp/src/remote/` — services (общие, projectId per-request), auth (user+project),
tools (персистентные, scoped), HTTP-сервер; запись `mcp:http` в скриптах; docs.

**Out:** структурные/граф remote-tools; OAuth (используем bearer-ключ); сессии/resumability.

## Этапы
- [x] `remote/services.ts` (общие сервисы из env).
- [x] `remote/auth.ts` (resolveUser по ключу, resolveProject по X-Project, owner-scoped).
- [x] `remote/tools.ts` (list_projects + персистентные tools, scoped по projectId).
- [x] `remote/server.ts` + `http.ts` (Bun.serve, stateless Streamable HTTP).
- [x] Live: SDK-клиент по HTTP с ключом+X-Project → list_projects/search_everywhere; docs; CI.

## Definition of Done
- Удалённый MCP отвечает по HTTP, аутентифицирует по API-ключу, скоупит по `X-Project`, отдаёт
  персистентные tools; нелегальный ключ/чужой проект → отказ. Проверено вживую SDK-клиентом.
- `bun run ci` зелёный; README/доки отражают хостинговую модель.
</content>
