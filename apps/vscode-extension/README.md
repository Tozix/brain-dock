# brain-dock — VSCode extension

A VEXP-style sidebar for the **brain-dock** hosted MCP platform. Connect with your API key, watch
your code index, and wire your AI agents (Claude Code, Cursor) to the remote MCP with one click.

## Features

- **Sidebar panel** — connection status, active project, index metrics (symbols / files / repos +
  role breakdown), token savings, and your repositories. Data comes from the hosted REST API
  (`x-api-key`) and the remote MCP `summarize_project` tool.
- **Setup Agents** — one click writes the MCP config for Claude Code (project `.mcp.json` / global
  `~/.claude.json`) and Cursor (`.cursor/mcp.json` / `~/.cursor/mcp.json`) so your agent sees the
  brain-dock tools automatically. Pick the targets in the UI.
- **Actions** — Force Re-index, Generate Context Capsule, Add / Connect Repository, switch project,
  View Logs, Settings.
- **Token Savings** — per-user MCP usage (calls + tokens served, with an estimated saving) over the
  last 30 days, served by `GET /api/v1/usage`.

See [plan 042](https://github.com/Tozix/brain-dock/blob/main/docs/plans/042-vscode-extension.md).

## Settings

| Setting | Default | Meaning |
|---|---|---|
| `brainDock.serverUrl` | `http://localhost:3000` | REST API base (without `/api/v1`). |
| `brainDock.mcpUrl` | `http://localhost:8080/mcp` | Remote MCP endpoint. |
| `brainDock.project` | — | Active project (slug/id) → `X-Project`. |

The API key is stored in VS Code **SecretStorage**, never in settings.

## Develop

```bash
bun install
cd apps/vscode-extension
bun run dev        # esbuild watch → dist/extension.js
# then press F5 in VS Code to launch an Extension Development Host
bun test           # unit tests for the pure helpers
bun run package    # → brain-dock.vsix (needs `bun run build` output)
```

`vscode` is an external (host-provided) module; everything else is bundled by esbuild.
