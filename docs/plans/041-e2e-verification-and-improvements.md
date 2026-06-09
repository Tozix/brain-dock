# 041 — Сквозная E2E-верификация hosted-стека + backlog улучшений

**Status:** Done (верификация) · backlog — Draft
**Фаза:** Hosted product / verification
**Дата:** 2026-06-10
**Связи:** [036-remote-mcp-http](036-remote-mcp-http.md) · [037-server-symbol-index](037-server-symbol-index.md) ·
[038-remote-structural-tools](038-remote-structural-tools.md) · [027-e2e-ci](027-e2e-ci.md) ·
[034-rest-http-e2e](034-rest-http-e2e.md) · [GUIDE.md](../GUIDE.md)

## Проблема
Все планы 000–040 закрыты, `bun run ci` зелёный — но это статическая проверка (юнит-тесты +
typecheck + lint). Реального сквозного прогона **всего hosted-пути вживую** (инфра → API → воркер →
Postgres/Qdrant → remote MCP по HTTP) в одной сессии не делалось. «Done в плане» ≠ «работает сейчас».
Цель — доказать, что заявленное в [GUIDE.md](../GUIDE.md) работает end-to-end, и устранить найденное.

## Сделано (верификация на реальной инфре)
Инфра (Postgres `15432` / Qdrant `16333` / Redis `16379` / Ollama), `EMBEDDER=deterministic`,
сервисы: API `:3100`, index-worker, remote MCP `:8080`.

1. **e2e-гейты.** Все 12 «skip» обычного `bun test` — это ровно `RUN_E2E`-гейтнутые suite'ы
   (`apps/api/src/e2e/{rest,integration}.e2e.test.ts`: 6 реальных `it` + хуки). С `RUN_E2E=1` против
   реальных Postgres+Qdrant — **6 pass / 0 fail**.
2. **REST-путь из GUIDE §4–5.** register → промоушен до `SUPER_ADMIN` → login → выпуск API-ключа
   (`bd_…`) → создание проекта → репозитория (`root=/home/tozix/dev/brain-dock`) → `reindex`
   (`{queued:true}`). Воркер отработал job: **121 файл, 247 chunks**.
3. **Индекс в Postgres.** `code_symbols`=247, `code_edges`=86; роли: module 12 / controller 11 /
   service 9 / guard 3 / interceptor 2 / pipe 1. Коллекция `code` в Qdrant заполнена.
4. **Remote MCP по HTTP (GUIDE §6–8).** Без auth → `401`; с `Authorization: Bearer` + `X-Project` →
   `tools/list` отдаёт все **23 инструмента**. Прогнаны вживую и вернули корректные данные:
   `list_projects`, `summarize_project` (Files 103 / Symbols 247), `find_service`/`find_controller`
   (substring-match), `find_endpoint` (HTTP-маршруты), `search_code` («JWT authentication guard» →
   AuthModule/AuthenticationGuard/RolesGuard), `get_architecture`, `impact`/`find_dependents`
   (PrismaService → 6 сервисов), `export_graph` (DOT), `remember`/`search_memory`,
   `save_knowledge`/`search_knowledge`, `search_everywhere` (нормализованный score), `generate_context`
   (intent=modify).
5. **Чистка качества.** 11 Biome-warnings → **0**: 3 `useOptionalChain` (`!u||!u.x` → `!u?.x`) в
   `apps/mcp/src/remote/auth.ts`, `apps/mcp/src/tools.ts`, `apps/api/src/api-keys/api-keys.service.ts`;
   5 `noExplicitAny` + 3 `suppressions/unused` — поправлено размещение `biome-ignore` в тест-даблах
   (`document.service.test.ts`, `repositories.service.test.ts`).

## Проверено
`bun run ci` зелёный: Biome **0 warnings** (было 11), typecheck **12/12**, тесты **127 pass / 12 skip
/ 0 fail**. Отдельно `RUN_E2E=1 … bun --no-addons test apps/api/src/e2e` → **6 pass**.
Замечание-не-баг: `save_knowledge` ожидает параметр `type` (enum), не `kind`.

## Out / дальше — backlog улучшений (приоритизировано)
**P1 — надёжность hosted-модели**
- **Git-подключение репозиториев.** Сейчас воркер индексирует только путь в ФС (`repository.root`) —
  для облака требуется монтирование. Нужен clone/pull по URL (+токен) во временный путь. → новый план.
- **e2e для remote MCP по HTTP.** Покрытие e2e есть для REST и RAG, но не для `/mcp` (initialize →
  `tools/list` → `tools/call` через auth+`X-Project`+rate-limit). Автоматизировать ручной чек из п.4. → новый план.

**P2 — продакшн-готовность**
- Redis-backed общий rate-limit для MCP между инстансами (сейчас per-process — см. [040](040-mcp-rate-limit.md)).
- `EMBEDDER=ollama` как прод-дефолт + прогрев/проверка модели в readiness; пре-auth IP-лимит и лимит размера тела.
- Security-review hosted-эндпоинтов (изоляция по `projectId`/`userId`, перебор ключей, утечки в ошибках).

**P3 — качество поиска и продукт**
- BM25/full-text, графовое расширение контекста (DI-соседи), обучаемый re-ranker (из roadmap «Далее»).
- Веб-UI/дашборд (проекты, ключи, статус индексации) + биллинг/квоты для hosted-модели.

## Definition of Done
- ✅ Полный hosted-путь из GUIDE.md проверен вживую: REST-auth → индексация → remote MCP (23 tools) с реальными данными.
- ✅ Все `RUN_E2E` e2e проходят против реальной инфры (6 pass).
- ✅ Biome 0 warnings; `bun run ci` зелёный.
- ⏭️ Backlog (P1–P3) внесён в реестр планов для последующих итераций.
