# 011 — Dependency Graph (@brain-dock/graph)

- **Status:** Done
- **Phase:** 8 (backlog — knowledge graph)
- **Связи:** [002-indexer](002-indexer.md) · [Claude.md](../../Claude.md) §Knowledge Graph

## Goal
Граф зависимостей символов из связей индексатора: зависимости, зависимые, транзитивный impact
(blast radius). Доступ через MCP.

## Сделано
- `@brain-dock/graph` (`SymbolGraph`): строится из `RepositoryIndex` (рёбра `injects`/`extends`/`implements`).
  Узлы помечаются `internal` (определён в репо) vs external (тип из библиотеки). Методы:
  `dependencies`, `dependents`, `impact` (транзитивные зависимые), `closure` (транзитивные зависимости).
- MCP-tools (26 всего): `find_dependencies`, `find_dependents`, `impact`. Граф кэшируется в
  `McpContext.getGraph()` и сбрасывается при `reindex`.

## Проверено вживую (на `apps/api`)
- `find_dependencies AuthService` → PrismaService / JwtService(external) / ConfigService / AuditService.
- `find_dependents PrismaService` → 5 сервисов; `impact PrismaService` → транзитивный blast radius
  (сервисы + контроллеры + guard).
- Unit-тесты: direct deps/dependents, transitive impact/closure, метаданные узлов.

## Далее
- Графовое расширение результатов поиска (подмешивать DI-соседей в Context Engine);
  пути между символами (`path`); экспорт графа (DOT/JSON); связи документов/API/бизнес-правил.
