# brain-dock — VSCode extension

A VEXP-style sidebar for the **brain-dock** hosted MCP platform. Connect with your API key, watch
your code index, and wire your AI agents (Claude Code, Cursor) to the remote MCP with one click.

## Features

- **Sidebar panel** — connection status, active project, index metrics (symbols / files / repos +
  role breakdown), and your repositories. Data comes from the hosted REST API (`x-api-key`) and the
  remote MCP `summarize_project` tool.
- **Setup Agents** *(in progress)* — write the MCP config for Claude Code (project `.mcp.json` /
  global) and Cursor (`.cursor/mcp.json`) so your agent sees brain-dock tools automatically.
- **Actions** — Force Re-index, switch project, settings. (Generate Context, Add Repository, Logs,
  Token Savings — landing per plan [042](../../docs/plans/042-vscode-extension.md).)

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
