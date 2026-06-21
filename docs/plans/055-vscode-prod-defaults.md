# 055 — Прод-дефолты VSCode-расширения (brain-dock.ru)

**Status:** Done
**Фаза:** Product / Client
**Дата:** 2026-06-21
**Связи:** [042](042-vscode-extension.md) · [048](048-native-vscode-mcp-registration.md) ·
[054](054-web-ui.md) (хостинг на `brain-dock.ru`)

## Цель
Чтобы пользователь hosted-продукта мог «поставить и начать пользоваться» без ручной правки
настроек: дефолтные `brainDock.serverUrl`/`brainDock.mcpUrl` должны указывать на боевой
хостинг `brain-dock.ru`, а не на `localhost`. Self-host остаётся возможным через override.

## Scope
- **In:** дефолты `serverUrl`/`mcpUrl` в `package.json` (contributes.configuration) и
  fallback'и в `config.ts`; уточнение описаний настроек (как переопределить под self-host);
  пометка в README расширения; пересборка `.vsix`.
- **Out:** публикация в Marketplace/Open VSX (отдельное решение по раздаче); логика Connect/Setup.

## Решения
- Прод-дефолты: `serverUrl=https://brain-dock.ru`, `mcpUrl=https://brain-dock.ru/mcp` — совпадает
  с host-nginx ([054](054-web-ui.md)): `/api/v1`→api, `/mcp`→mcp.
- Self-host: пользователь переопределяет обе настройки на свой адрес (описание это поясняет).
- Единый источник дефолтов — `package.json`; fallback'и в `config.ts` держим синхронными на случай,
  когда настройка не зарегистрирована (тесты/иные хосты).

## Этапы
- [x] `package.json`: дефолты `serverUrl`/`mcpUrl` → `brain-dock.ru`; описания дополнены про self-host.
- [x] `config.ts`: fallback'и `readSettings()` синхронны с новыми дефолтами.
- [x] README расширения: отметить, что по умолчанию подключается к `brain-dock.ru`.
- [x] Пересборка `.vsix`; typecheck + тесты расширения зелёные; `bun run ci` зелёный.

## Риски
- Self-host'ер забудет переопределить URL → попадёт на `brain-dock.ru`. Минимизируется описанием
  настройки и README; данные не утекают — без валидного API-ключа сервер отвечает 401.

## Definition of Done
- Свежеустановленный `.vsix` без правки настроек открывает Connect против `brain-dock.ru`;
  Setup Agents пишет `https://brain-dock.ru/mcp` в конфиги агентов.
