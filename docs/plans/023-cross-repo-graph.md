# 023 — Кросс-репо граф зависимостей

**Status:** Done
**Фаза:** Backlog (Multi-Project / Multi-Repository)
**Связи:** [011-dependency-graph](011-dependency-graph.md) · [015-multi-repo](015-multi-repo.md) · [019-graph-export](019-graph-export.md)

## Goal
Дать трассировку зависимостей **между репозиториями** проекта: символ, определённый в репо B,
но используемый (DI/extends/implements) в репо A, должен связываться в едином графе, чтобы
`impact`/`dependents`/`export_graph` работали поверх границ репо.

## Подход
Имена символов — единственный кросс-репо ключ (модульное разрешение вне scope). Объединяем
пер-репо графы: узел, внешний (unresolved) в одном репо и внутренний (defined) в другом,
склеивается в один внутренний узел → рёбра из всех репо образуют связный граф. Коллизия имён
(символ внутренний в >1 репо) не разрешается — берётся первое определение (задокументировано).

## Scope
**In:**
- `GraphNode.repo?` (где определён символ); `SymbolGraph.fromIndex(index, repo?)` проставляет его.
- `SymbolGraph.merge(graphs[])` — объединённый граф.
- `McpContext.getMergedGraph()` (кэш) + `getGraph` проставляет repo узлам.
- MCP: `allRepos?` у `find_dependencies`/`find_dependents`/`impact` и `export_graph` —
  использовать объединённый граф; в выводе показывать репо узла.
- Unit-тесты на кросс-репо `merge`.

**Out:** разрешение по модулям/путям импорта; разрешение коллизий имён.

## Этапы
- [x] `GraphNode.repo`, `fromIndex(repo?)`, `SymbolGraph.merge` + тесты.
- [x] `McpContext.getMergedGraph` + repo-аннотация узлов.
- [x] MCP `allRepos` в граф-tools и `export_graph`.
- [x] Docs (architecture/mcp/Claude.md) + CI + commit/push.

## Definition of Done
- `merge` строит связный кросс-репо граф (тест: символ A-репо зависит от символа B-репо).
- MCP `impact … allRepos:true` пересекает границы репо; `export_graph allRepos:true` отдаёт общий граф.
- `bun run ci` зелёный; документация обновлена.
</content>
