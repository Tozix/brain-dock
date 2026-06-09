# 049 — Панель: селектор периода + видимый прогресс индексации

**Status:** Done
**Фаза:** Hosted product / client
**Дата:** 2026-06-10
**Связи:** [047-vexp-like-panel-honest-usage](047-vexp-like-panel-honest-usage.md) ·
[046-index-uploaded-files-no-git](046-index-uploaded-files-no-git.md)

## Запрос
1. Селектор периода для секции ИСПОЛЬЗОВАНИЕ — начиная с **1 дня (Сегодня)**.
2. Не видно, идёт ли индексация — нужен прогресс **и в панели, и в логах** + понятное состояние сервера.

## Сделано
- **Селектор периода** в шапке ИСПОЛЬЗОВАНИЕ: `Сегодня · 7 · 30 · 90 дней` (по умолчанию **Сегодня /
  1 день**). `PanelProvider` хранит `periodDays` (default 1), сообщение `{type:'setPeriod', days}` →
  `loadState(periodDays)` → `getUsage(periodDays)`. Локализовано (`period.today`/`period.days`).
- **Прогресс индексации в панели**: `PanelProvider.setBusy(msg)` рисует баннер `⏳ …` с анимированной
  полосой. `ensureWorkspaceProject` зовёт `setBusy` на этапах (provisioning → uploading N файлов) и
  чистит в `finally`. Параллельно — нотификация VS Code (`withProgress`).
- **Логи по этапам** в OutputChannel «brain-dock»: `collecting workspace files…`, `uploading N
  files…`, `done: N symbols / N chunks / N files`.
- Версия 0.7.0.

## Заметка по «состоянию сервера»
Лог `mcpServer.braindock…` с «Остановлено» через ~3 мин — это VS Code сам гасит **простаивающий
нативный MCP-сервер** (норма, не ошибка, к индексации не относится). «Состояние сервера» для
пользователя отражает статус-строка панели (`● подключено/ошибка` = доступность REST на serverUrl).
Прогресс индексации логируется в канал «brain-dock», а НЕ в лог MCP-сервера.

## Definition of Done
- Период переключается (по умолчанию Сегодня); во время индексации в панели виден баннер прогресса,
  а в канале «brain-dock» — пошаговые логи. `bun run ci` зелёный.
