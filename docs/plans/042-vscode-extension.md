# 042 — VSCode-расширение (VEXP-подобная панель + Setup Agents для MCP)

**Status:** Done
**Фаза:** Hosted product / client
**Дата:** 2026-06-10
**Связи:** [036-remote-mcp-http](036-remote-mcp-http.md) · [033-api-key-auth](033-api-key-auth.md) ·
[041-e2e-verification-and-improvements](041-e2e-verification-and-improvements.md) · [GUIDE.md](../GUIDE.md)

## Идея
Аналог расширения VEXP для VSCode: боковая панель, показывающая статус индекса нашего hosted-сервера,
и — главное — кнопка **«Setup Agents»**, которая автоматически прописывает наш remote MCP в конфиги
AI-агентов (Claude Code project/global, Cursor). Пользователь ставит расширение, вводит URL сервера +
API-ключ, выбирает проект — и его агент сразу видит инструменты brain-dock.

Решения пользователя: **полная VEXP-подобная панель**; Setup Agents — **Claude Code (project + global)
и Cursor, с выбором в UI**. Git-подключение репозиториев — опционально (отложено, P3 плана 041).

## Архитектура
Новое приложение `apps/vscode-extension` (`@brain-dock/vscode-extension`, private). Bundling — esbuild
(`vscode` external), упаковка — `@vscode/vsce` → `.vsix`. UI панели — webview на vanilla HTML/CSS с
темовыми переменными `--vscode-*` (как у VEXP, без тяжёлых UI-зависимостей). Клиент дёргает наш REST
(`/api/v1`, заголовок `x-api-key`); MCP-инструменты — через тот же hosted `/mcp`. API-ключ хранится в
`SecretStorage` (не в settings). Сервер: новый REST-эндпоинт статуса индекса + лёгкая телеметрия.

REST уже есть: `GET /projects`, `…/repositories`, `POST …/reindex`. Добавляем на сервере:
`GET /projects/:id/index-status` (символы/рёбра/файлы по репо из `SymbolIndexService`) и счётчик usage.

## Этапы
- [x] **1–2. Scaffold + клиент + настройки + панель.** `apps/vscode-extension` (manifest, esbuild,
  tsconfig), REST/MCP-клиент с `x-api-key`/Bearer, Settings + API-ключ в SecretStorage, команды
  Connect/Refresh/SelectProject, VEXP-подобная webview-панель (статус индекса из MCP
  `summarize_project`, репозитории, действия). *Статус индекса берём из MCP, отдельный REST-эндпоинт
  не понадобился.*
- [x] **3. Setup Agents (мультиклиент).** Мультивыбор в UI: Claude Code project (`.mcp.json`) / global
  (`~/.claude.json`), Cursor project/global. Слияние с существующими конфигами; проверено вживую
  (сгенерированный `.mcp.json` аутентифицируется в MCP → 23 tools).
- [x] **4. Действия.** Force Re-index, Generate Context Capsule (MCP `generate_context` → markdown),
  Add/Connect Repository (REST), View Logs (OutputChannel). Проверено вживую через `BrainDockClient`.
- [x] **5. Token Savings + упаковка.** Серверная телеметрия (`McpUsageDaily` + `UsageService`, запись
  в MCP, чтение через `GET /api/v1/usage`); панель Token Savings; `vsce package` → `brain-dock.vsix`;
  README + раздел 6.4 в GUIDE. Проверено вживую (5 вызовов → calls=5, est saved=4952, 80%).

## Риски
- Версии VSCode API/тулинга — ставить свежие стабильные (`@types/vscode`, `esbuild`, `@vscode/vsce`),
  сверять через Context7/npm; не использовать pre-release.
- `vscode` нельзя бандлить — только external; тесты расширения требуют VS Code-хоста (юнит-логику
  выносим в чистые функции и тестируем через Bun).
- Token savings — настоящая метрика требует серверной телеметрии; «saved» подаём как прозрачную оценку.

## Definition of Done
- Установленное `.vsix` показывает статус индекса hosted-проекта и список репозиториев.
- «Setup Agents» рабоче прописывает MCP для Claude Code (project/global) и Cursor; агент видит tools.
- Force Re-index / Generate Context / Add Repository / Logs работают против hosted-сервера.
- `bun run ci` зелёный (новый workspace проходит typecheck + lint + юнит-тесты чистой логики).
