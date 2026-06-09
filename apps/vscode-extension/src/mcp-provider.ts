// Register the brain-dock remote MCP with VS Code's native MCP registry (VS Code ≥ 1.101). This
// makes the tools available to the editor's own MCP consumers — GitHub Copilot Chat agent mode and
// the "MCP SERVERS — INSTALLED" UI — with zero manual config. Our server is remote, so we publish an
// HTTP definition (vs VEXP's local stdio one). The definition refreshes whenever the API key or
// settings change. Complements "Setup Agents" (which configures external CLIs like Claude Code/Cursor).
import * as vscode from 'vscode';
import { API_KEY_SECRET, getApiKey, readSettings } from './config';

export function registerMcpProvider(context: vscode.ExtensionContext): void {
  const changed = new vscode.EventEmitter<void>();
  const version = (context.extension.packageJSON as { version?: string }).version ?? '0.0.0';

  context.subscriptions.push(
    changed,
    vscode.lm.registerMcpServerDefinitionProvider('brainDock.mcp', {
      onDidChangeMcpServerDefinitions: changed.event,
      provideMcpServerDefinitions: async () => {
        const apiKey = await getApiKey(context.secrets);
        const { mcpUrl, project } = readSettings();
        if (!apiKey || !mcpUrl) return [];
        const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };
        if (project) headers['X-Project'] = project;
        return [
          new vscode.McpHttpServerDefinition(
            'brain-dock',
            vscode.Uri.parse(mcpUrl),
            headers,
            version,
          ),
        ];
      },
      resolveMcpServerDefinition: (server) => server,
    }),
    // Re-publish when the key or any brain-dock setting changes (VS Code re-resolves the server).
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('brainDock')) changed.fire();
    }),
    context.secrets.onDidChange((e) => {
      if (e.key === API_KEY_SECRET) changed.fire();
    }),
  );
}
