import * as vscode from 'vscode';
import { BrainDockClient } from './api/client';
import { clearApiKey, getApiKey, readSettings, setProject, storeApiKey } from './config';
import type { PanelState } from './panel/html';
import { PanelProvider } from './panel/provider';
import { type AgentTarget, applyTarget, type McpServerConfig } from './setup/agents';
import type { Project, Repository } from './util';

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function activate(context: vscode.ExtensionContext): void {
  const secrets = context.secrets;
  const output = vscode.window.createOutputChannel('brain-dock');
  context.subscriptions.push(output);
  output.appendLine('[brain-dock] extension activated');

  const fail = (err: unknown): void => {
    const m = errMsg(err);
    output.appendLine(`[error] ${m}`);
    vscode.window.showErrorMessage(`brain-dock: ${m}`);
  };

  const buildClient = async (): Promise<BrainDockClient | undefined> => {
    const apiKey = await getApiKey(secrets);
    return apiKey ? new BrainDockClient({ ...readSettings(), apiKey }) : undefined;
  };

  const findProject = (projects: Project[], key: string): Project | undefined =>
    projects.find((p) => p.slug === key || p.id === key);

  const loadState = async (): Promise<PanelState> => {
    const s = readSettings();
    const apiKey = await getApiKey(secrets);
    const state: PanelState = {
      configured: Boolean(apiKey),
      connected: false,
      serverUrl: s.serverUrl,
      project: s.project,
    };
    if (!apiKey) return state;
    const client = new BrainDockClient({ ...s, apiKey });
    try {
      const projects = await client.listProjects();
      state.connected = true;
      if (s.project) {
        const proj = findProject(projects, s.project);
        if (proj) state.repos = await client.listRepositories(proj.id);
        state.status = await client.indexStatus();
      }
    } catch (err) {
      state.error = errMsg(err);
    }
    return state;
  };

  const provider = new PanelProvider(context.extensionUri, loadState);
  const refresh = () => provider.refresh();

  const register = (id: string, fn: () => void | Promise<void>): void => {
    context.subscriptions.push(vscode.commands.registerCommand(id, fn));
  };

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(PanelProvider.viewId, provider),
  );

  register('brainDock.refresh', refresh);

  register('brainDock.connect', async () => {
    const key = await vscode.window.showInputBox({
      title: 'brain-dock API key',
      prompt: 'Paste your bd_… API key',
      password: true,
      ignoreFocusOut: true,
    });
    if (!key) return;
    await storeApiKey(secrets, key.trim());
    vscode.window.showInformationMessage('brain-dock: API key saved.');
    await refresh();
  });

  register('brainDock.signOut', async () => {
    await clearApiKey(secrets);
    vscode.window.showInformationMessage('brain-dock: signed out.');
    await refresh();
  });

  register('brainDock.openSettings', () => {
    void vscode.commands.executeCommand('workbench.action.openSettings', 'brainDock');
  });

  register('brainDock.selectProject', async () => {
    const client = await buildClient();
    if (!client) {
      vscode.window.showWarningMessage('brain-dock: set your API key first (Connect).');
      return;
    }
    try {
      const projects = await client.listProjects();
      if (projects.length === 0) {
        vscode.window.showInformationMessage(
          'brain-dock: no projects yet — create one via the API.',
        );
        return;
      }
      const pick = await vscode.window.showQuickPick(
        projects.map((p) => ({ label: p.slug, description: p.name, detail: p.id })),
        { title: 'Select brain-dock project' },
      );
      if (!pick) return;
      await setProject(pick.label);
      await refresh();
    } catch (err) {
      fail(err);
    }
  });

  register('brainDock.reindex', async () => {
    const s = readSettings();
    const client = await buildClient();
    if (!client || !s.project) {
      vscode.window.showWarningMessage('brain-dock: connect and select a project first.');
      return;
    }
    try {
      const proj = findProject(await client.listProjects(), s.project);
      if (!proj) {
        vscode.window.showErrorMessage('brain-dock: active project not found.');
        return;
      }
      const repos = await client.listRepositories(proj.id);
      if (repos.length === 0) {
        vscode.window.showInformationMessage('brain-dock: no repositories to re-index.');
        return;
      }
      let pick: Repository | undefined;
      if (repos.length === 1) {
        pick = repos[0];
      } else {
        const chosen = await vscode.window.showQuickPick(
          repos.map((r) => ({ label: r.alias, description: r.root, id: r.id })),
          { title: 'Re-index which repository?' },
        );
        pick = chosen ? repos.find((r) => r.id === chosen.id) : undefined;
      }
      if (!pick) return;
      await client.reindex(proj.id, pick.id);
      vscode.window.showInformationMessage(`brain-dock: re-index queued for ${pick.alias}.`);
      await refresh();
    } catch (err) {
      fail(err);
    }
  });

  register('brainDock.setupAgents', async () => {
    const s = readSettings();
    const apiKey = await getApiKey(secrets);
    if (!apiKey || !s.project) {
      vscode.window.showWarningMessage('brain-dock: connect and select a project first.');
      return;
    }
    const items: Array<vscode.QuickPickItem & { target: AgentTarget }> = [
      { label: 'Claude Code — project (.mcp.json)', target: 'claude-project', picked: true },
      { label: 'Claude Code — global (~/.claude.json)', target: 'claude-global' },
      { label: 'Cursor — project (.cursor/mcp.json)', target: 'cursor-project' },
      { label: 'Cursor — global (~/.cursor/mcp.json)', target: 'cursor-global' },
    ];
    const picks = await vscode.window.showQuickPick(items, {
      title: 'Setup Agents — write the brain-dock MCP config',
      canPickMany: true,
    });
    if (!picks || picks.length === 0) return;
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const cfg: McpServerConfig = {
      serverName: 'brain-dock',
      mcpUrl: s.mcpUrl,
      apiKey,
      project: s.project,
    };
    const written: string[] = [];
    for (const pick of picks) {
      try {
        written.push(applyTarget(pick.target, cfg, workspaceRoot));
      } catch (err) {
        fail(err);
      }
    }
    if (written.length === 0) return;
    const choice = await vscode.window.showWarningMessage(
      `brain-dock: wrote MCP config to ${written.length} file(s). They contain your API key — gitignore them if this repo is shared.`,
      'Open file',
    );
    if (choice === 'Open file' && written[0]) {
      void vscode.window.showTextDocument(vscode.Uri.file(written[0]));
    }
  });

  register('brainDock.generateContext', async () => {
    const s = readSettings();
    const client = await buildClient();
    if (!client || !s.project) {
      vscode.window.showWarningMessage('brain-dock: connect and select a project first.');
      return;
    }
    const query = await vscode.window.showInputBox({
      title: 'Generate context',
      prompt: 'Describe the task or question to assemble context for',
      ignoreFocusOut: true,
    });
    if (!query) return;
    try {
      const text = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'brain-dock: generating context…',
        },
        () => client.generateContext(query),
      );
      const doc = await vscode.workspace.openTextDocument({ content: text, language: 'markdown' });
      await vscode.window.showTextDocument(doc, { preview: true });
      output.appendLine(`[context] "${query}" → ${text.length} chars`);
    } catch (err) {
      fail(err);
    }
  });

  register('brainDock.addRepository', async () => {
    const s = readSettings();
    const client = await buildClient();
    if (!client || !s.project) {
      vscode.window.showWarningMessage('brain-dock: connect and select a project first.');
      return;
    }
    try {
      const proj = findProject(await client.listProjects(), s.project);
      if (!proj) {
        vscode.window.showErrorMessage('brain-dock: active project not found.');
        return;
      }
      const alias = await vscode.window.showInputBox({
        title: 'Add repository — alias',
        prompt: 'Short unique alias (e.g. api)',
        ignoreFocusOut: true,
      });
      if (!alias) return;
      const root = await vscode.window.showInputBox({
        title: 'Add repository — root path',
        prompt: 'Filesystem path the server/worker can read',
        value: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '',
        ignoreFocusOut: true,
      });
      if (!root) return;
      const repo = await client.createRepository(proj.id, { name: alias, alias, root });
      output.appendLine(`[repo] created ${repo.alias} (${repo.root})`);
      const choice = await vscode.window.showInformationMessage(
        `brain-dock: added repository ${repo.alias}.`,
        'Re-index now',
      );
      if (choice === 'Re-index now') await client.reindex(proj.id, repo.id);
      await refresh();
    } catch (err) {
      fail(err);
    }
  });

  register('brainDock.viewLogs', () => output.show());
}

export function deactivate(): void {
  // nothing to dispose beyond context.subscriptions
}
