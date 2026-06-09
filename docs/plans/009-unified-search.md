# 009 — Unified Search (search_everywhere)

- **Status:** Done
- **Phase:** 8 (backlog — search expansion)
- **Связи:** [003-rag-engine](003-rag-engine.md) · [Claude.md](../../Claude.md) §MCP

## Goal
Единый поиск по всем источникам проекта: код + память + знания + документы — одним запросом,
с ранжированием в общий список (MCP-tool `search_everywhere` из ТЗ).

## Сделано
- `UnifiedSearchService` (`@brain-dock/search`): структурные источники (без новых пакетных
  зависимостей), параллельный запрос к 4 источникам, слияние и сортировка по score; падение
  одного источника не валит запрос (`.catch(() => [])`).
- MCP-tool `search_everywhere` (18 MCP-tools всего); `McpContext.unified`.
- REST `GET /api/v1/projects/:projectId/search?q=` (`UnifiedSearchService` как провайдер) + OpenAPI-путь.

## Проверено вживую
- MCP `search_everywhere "how to run the project and authentication"` → объединённый список:
  `[code]` ProjectsService/ApiKeysService/… + `[memory]` DECISION — в одном ранжировании.
- Unit-тесты: слияние/сортировка/тегирование источника, limit, устойчивость к падению источника.

## Далее
- Нормализация шкал score между источниками; графовое расширение (DI-соседи);
  weight-настройка по intent; пагинация.
