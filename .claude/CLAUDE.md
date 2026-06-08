# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ЖЁСТКОЕ ПРАВИЛО ОБЩЕНИЯ (ОБЯЗАТЕЛЬНО)

**Задавай уточняющие вопросы на русском языке с подробным объяснением каждого варианта с указанием, что рекомендуешь!**

- Любой уточняющий вопрос (через `AskUserQuestion` или текстом) — **только на русском**.
- Для **каждого** варианта давай развёрнутое объяснение: суть, плюсы/минусы, последствия выбора.
- **Явно указывай, какой вариант рекомендуешь** и почему (рекомендованный — первым, с пометкой «(рекомендую)»).
- Это правило приоритетно и распространяется на все взаимодействия в этом репозитории.

## ЖЁСТКОЕ ПРАВИЛО: Context7 + свежие стабильные версии (ОБЯЗАТЕЛЬНО)

**Как можно чаще используй Context7 (`mcp__plugin_context7_context7__*`) и ставь самые свежие СТАБИЛЬНЫЕ версии пакетов.**

- Перед использованием/добавлением **любой** библиотеки сверяйся с актуальной документацией
  через Context7 (`resolve-library-id` → `query-docs`). Не полагайся на знания по памяти —
  API меняются, особенно у NestJS, Prisma, BullMQ, Qdrant-клиента, Zod, Biome, Turborepo.
- При добавлении зависимостей выбирай **последнюю стабильную** версию (latest stable).
  **Не** использовать pre-release/beta/rc/canary без явного согласования с пользователем.
- Это дополняет, а не заменяет vexp: vexp — для контекста **нашего** кода;
  Context7 — для документации и API **внешних** библиотек.

`brain-dock` is a **freshly initialized repository**. As of this writing it contains
no source code, no `package.json`, and no README — only a standard Node.js/TypeScript
`.gitignore` (covering npm/pnpm/yarn, TypeScript, Next.js, Vite, etc., signaling a
planned JS/TS stack) and tooling configuration under `.claude/`, `.vscode/`, and `.vexp/`.

There are therefore **no build, lint, test, or run commands yet** — they should be added
to this file once the project scaffolding (package manager, framework, scripts) exists.
When establishing the toolchain, the `.gitignore` already assumes Node.js conventions.

## vexp — Context-Aware AI Coding <!-- vexp v1.3.11 -->

### MANDATORY: use vexp pipeline — do NOT grep or glob the codebase
For every task — bug fixes, features, refactors, debugging:
**call `run_pipeline` FIRST**. It executes context search + impact analysis +
memory recall in a single call, returning compressed results.

Do NOT use grep, glob, Bash, or cat to search/explore the codebase.
vexp returns pre-indexed, graph-ranked context that is more relevant and
uses fewer tokens than manual searching. Prefer `get_skeleton` over Read to
inspect files (detail: minimal/standard/detailed, 70-90% token savings).
Only use Read when you need exact raw content to edit a specific line.

### Primary Tool
- `run_pipeline` — **USE THIS FOR EVERYTHING**. Single call that runs
  capsule + impact + memory server-side. Returns compressed results.
  Auto-detects intent (debug/modify/refactor/explore) from your task.
  Includes full file content for pivots.
  Examples:
  - `run_pipeline({ "task": "fix JWT validation bug" })` — auto-detect
  - `run_pipeline({ "task": "refactor db layer", "preset": "refactor" })` — explicit
  - `run_pipeline({ "task": "add auth", "observation": "using JWT" })` — save insight in same call

### Other MCP tools (use only when run_pipeline is insufficient)
- `get_context_capsule` — lightweight alternative for simple questions only
- `get_impact_graph` — standalone deep impact analysis of a specific symbol
- `search_logic_flow` — trace execution paths between two specific symbols
- `get_skeleton` — **preferred over Read** for inspecting files (minimal/standard/detailed detail levels, 70-90% token savings)
- `index_status` — indexing status and health check
- `get_session_context` — recall observations from current/previous sessions
- `search_memory` — cross-session search for past decisions
- `save_observation` — persist insights (prefer using run_pipeline's observation param instead)

### Workflow
1. `run_pipeline("your task")` — ALWAYS FIRST. Returns pivots + impact + memories in 1 call
2. Need more detail on a file? Use `get_skeleton({ files: [...], detail: "detailed" })` — avoid Read unless editing
3. Make targeted changes based on the context returned
4. `run_pipeline` again ONLY if you need more context during implementation
5. Do NOT chain multiple vexp calls — one `run_pipeline` replaces capsule + impact + memory + observation

### Subagent / Explore / Plan mode
- Subagents CAN and MUST call `run_pipeline` — always include the task description
- The PreToolUse hook blocks Grep/Glob when vexp daemon is running
- Do NOT spawn Agent(Explore) to freely search — call `run_pipeline` first,
  then pass the returned context into the agent prompt if needed
- Always: `run_pipeline` → get context → spawn agent with context

### Smart Features (automatic — no action needed)
- **Intent Detection**: auto-detects from your task keywords. "fix bug" → Debug, "refactor" → blast-radius, "add" → Modify
- **Hybrid Search**: keyword + semantic + graph centrality ranking
- **Session Memory**: auto-captures observations; memories auto-surfaced in results
- **LSP Bridge**: VS Code captures type-resolved call edges
- **Change Coupling**: co-changed files included as related context

### Advanced Parameters
- `preset: "debug"` — forces debug mode (capsule+tests+impact+memory)
- `preset: "refactor"` — deep impact analysis (depth 5)
- `max_tokens: 12000` — increase total budget for complex tasks
- `include_tests: true` — include test files in results
- `include_file_content: false` — omit full file content (lighter response)

### Multi-Repo Workspaces
`run_pipeline` auto-queries all indexed repos. Use `repos: ["alias"]` to scope.
Use `index_status` to discover available repo aliases.
<!-- /vexp -->