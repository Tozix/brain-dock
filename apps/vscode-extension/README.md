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
- **Usage** — the USAGE section shows per-user MCP usage (calls + tokens served, via
  `GET /api/v1/usage`) for a selectable period (Today / 7 / 30 / 90 days). When the server cannot
  report usage, the panel shows `—` and the error is logged to the output channel.

See [plan 042](https://github.com/Tozix/brain-dock/blob/main/docs/plans/042-vscode-extension.md).

## Notes & limitations

- `brainDock.reindex` (Force Re-index) and `brainDock.indexWorkspace` are intentionally the same
  operation — both command ids are kept so existing keybindings keep working.
- **Multi-root workspaces**: only the *first* workspace folder is indexed; the extension shows a
  one-time warning per workspace. Add the other folders via "Add / Connect Repository" if needed.
- Workspace upload is budgeted: files over 512 KB are skipped and the total upload is capped at
  40 MB (you get a warning when the cap is hit).
- On the first open of a folder the extension asks before creating a project and uploading files
  ("Index this folder in Brain Dock?"); answering **Never** opts that workspace out permanently.

## Settings

| Setting | Default | Meaning |
|---|---|---|
| `brainDock.serverUrl` | `http://localhost:3000` | REST API base (without `/api/v1`). |
| `brainDock.mcpUrl` | `http://localhost:8080/mcp` | Remote MCP endpoint. |
| `brainDock.project` | — | Active project (slug/id) → `X-Project`. Stored per-workspace when a folder is open, so different windows can use different projects. |

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
