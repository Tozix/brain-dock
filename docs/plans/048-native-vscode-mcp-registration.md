# 048 — Нативная регистрация MCP в VS Code (как VEXP)

**Status:** Done
**Фаза:** Hosted product / client
**Дата:** 2026-06-10
**Связи:** [042-vscode-extension](042-vscode-extension.md) · [036-remote-mcp-http](036-remote-mcp-http.md) ·
[GUIDE.md](../GUIDE.md)

## Зачем (изучено)
VS Code ≥ 1.101 имеет встроенную поддержку MCP: расширение регистрирует сервер через
`vscode.lm.registerMcpServerDefinitionProvider` + вклад `contributes.mcpServerDefinitionProviders`.
Тогда сервер виден нативному MCP-клиенту редактора (**GitHub Copilot Chat agent mode** и др.) и
появляется в UI «СЕРВЕРЫ MCP — УСТАНОВЛЕННЫЕ» — **без ручного `.mcp.json`/`claude mcp add`**. VEXP так
делает (тип `stdio`, локальный `mcp-server.cjs`). Нам это нужно: покрывает **самого Copilot/VS Code**,
тогда как «Setup Agents» настраивает внешние CLI (Claude Code, Cursor).

## Сделано
- `contributes.mcpServerDefinitionProviders: [{ id: "brainDock.mcp", label: "brain-dock" }]`;
  `engines.vscode ^1.101.0`, `@types/vscode ^1.101.0`.
- `src/mcp-provider.ts`: провайдер возвращает `McpHttpServerDefinition('brain-dock', Uri(mcpUrl),
  { Authorization: Bearer <key>, X-Project: <project> }, version)` (наш MCP — удалённый HTTP, не stdio).
  Пусто, пока нет ключа. Перепубликация по `onDidChange` при изменении `brainDock`-настроек
  (`onDidChangeConfiguration`) и API-ключа (`secrets.onDidChange`) — VS Code сам перечитывает сервер.
- Подключено в `activate`. Версия 0.6.0.

## Проверено
`tsc` видит API (`@types/vscode` 1.120), `bun run ci` зелёный, `.vsix` собирается. Вживую сервер
появляется в нативном списке MCP VS Code после ввода ключа (заголовки те же, что уже проверены для
remote MCP — 23 tools).

## Заметка по безопасности
Заголовок с `Bearer <ключ>` попадает в определение MCP-сервера VS Code (ключ хранится в SecretStorage,
но в заголовке передаётся как есть) — стандартный паттерн для remote MCP. Для общих машин — отзывать
ключ при необходимости.

## Definition of Done
- Расширение регистрирует brain-dock как нативный MCP-сервер VS Code (HTTP), авт"подхватываемый"
  Copilot agent mode; обновляется при смене ключа/настроек. `bun run ci` зелёный.
