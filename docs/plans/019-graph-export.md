# 019 — Экспорт графа зависимостей

**Status:** Done
**Фаза:** Backlog
**Связи:** [011-dependency-graph](011-dependency-graph.md) · [015-multi-repo](015-multi-repo.md)

## Goal
Дать возможность выгрузить граф зависимостей символов в машинно-/человекочитаемом виде
(JSON для инструментов, Graphviz **DOT** для визуализации) через MCP.

## Scope
**In:**
- `SymbolGraph.toJSON()` → `{ nodes, edges }`; `SymbolGraph.toDot()` → Graphviz DOT
  (внешние узлы — пунктиром, рёбра подписаны видом связи).
- MCP-tool `export_graph` (`format: json|dot`, опц. `repo`; в multi-repo — выбранный/первый репо).
- Unit-тесты на оба формата.

**Out:**
- Объединённый кросс-репо граф; REST-эндпоинт экспорта; фильтры по подграфу/глубине.

## Этапы
- [x] `toJSON`/`toDot` в `@brain-dock/graph` + тесты.
- [x] MCP `export_graph`.
- [x] Docs (mcp/roadmap/Claude.md) + CI + commit/push.

## Definition of Done
- `export_graph` отдаёт корректный JSON и валидный DOT (`digraph`), узлы/рёбра экранированы.
- `bun run ci` зелёный; документация обновлена.
</content>
