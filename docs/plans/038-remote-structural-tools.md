# 038 — Remote структурные/граф-tools (поверх серверного индекса)

**Status:** Done
**Фаза:** Hosted product
**Связи:** [036-remote-mcp-http](036-remote-mcp-http.md) · [037-server-symbol-index](037-server-symbol-index.md)

## Goal
Доукомплектовать удалённый MCP структурными/граф-tools, читая **серверный индекс символов**
(Postgres, план 037) вместо файловой системы — полный паритет remote ↔ local.

## Сделано
- `SymbolIndexService` добавлен в `RemoteServices`.
- Remote-tools (scoped по `X-Project`, из Postgres): `find_symbol`, `find_controller`/`find_service`/
  `find_module`/`find_guard`/`find_repository`, `find_endpoint`, `summarize_project`,
  `get_architecture`, `find_dependencies`/`find_dependents`/`impact`, `export_graph` (json|dot).
- Граф строится из строк БД (`SymbolIndexService.graph`).

## Проверено вживую (полный хостинговый поток)
register → promote → key → project → repository(root) → **reindex (BullMQ)** → воркер проиндексировал
`apps/api/src` → **73 символа в Postgres** → SDK-клиент по HTTP (Bearer + X-Project):
`find_symbol AuthService` (`api/auth/auth.service.ts:16`), `summarize_project` (52 файла),
`impact AuthService` → `AuthController` (граф из БД).

## Definition of Done
- ✅ Все структурные/граф-tools доступны remote (без файлов пользователя), scoped по проекту.
- ✅ `bun run ci` зелёный (124 pass); сквозной хостинговый поток подтверждён вживую.
</content>
