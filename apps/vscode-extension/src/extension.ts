import { basename } from 'node:path';
import * as vscode from 'vscode';
import { ApiError, BrainDockClient } from './api/client';
import {
  clearApiKey,
  getApiKey,
  readSettings,
  resolveLang,
  SECTION,
  setProject,
  storeApiKey,
} from './config';
import { t } from './i18n';
import { registerMcpProvider } from './mcp-provider';
import type { PanelState } from './panel/html';
import { PanelProvider, type SettingsValues } from './panel/provider';
import { type AgentTarget, applyTarget, type McpServerConfig } from './setup/agents';
import {
  classifyUpload,
  type FileContent,
  findProject,
  pickProject,
  slugify,
  UPLOAD_BUDGET_BYTES,
} from './util';

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

// workspaceState keys
const AUTO_INDEX_CONSENT_KEY = 'brainDock.autoIndexConsent'; // 'yes' | 'never'
const MULTI_ROOT_WARNED_KEY = 'brainDock.multiRootWarned';

interface CollectResult {
  files: FileContent[];
  truncated: boolean;
}

// Read the workspace's TypeScript sources (respecting common ignores + per-file and total size
// budgets) to upload for server-side indexing — no git or server-side path required.
async function collectWorkspaceFiles(folder: vscode.WorkspaceFolder): Promise<CollectResult> {
  const exclude = '**/{node_modules,dist,build,out,.next,.turbo,.git,generated,coverage,.vexp}/**';
  const uris = await vscode.workspace.findFiles(
    new vscode.RelativePattern(folder, '**/*.{ts,tsx}'),
    exclude,
    5000,
  );
  const decoder = new TextDecoder();
  const files: FileContent[] = [];
  let totalBytes = 0;
  let truncated = false;
  for (const uri of uris) {
    const rel = vscode.workspace.asRelativePath(uri, false).split('\\').join('/');
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const verdict = classifyUpload(rel, bytes.byteLength, totalBytes);
      if (verdict === 'skip') continue;
      if (verdict === 'stop') {
        truncated = true;
        break;
      }
      totalBytes += bytes.byteLength;
      files.push({ path: rel, content: decoder.decode(bytes) });
    } catch {
      // unreadable file — skip
    }
  }
  return { files, truncated };
}

export function activate(context: vscode.ExtensionContext): void {
  const secrets = context.secrets;
  const output = vscode.window.createOutputChannel('brain-dock');
  context.subscriptions.push(output);
  output.appendLine('[brain-dock] extension activated');

  // Publish the brain-dock MCP to VS Code's native MCP registry (Copilot agent mode, etc.).
  registerMcpProvider(context, output);

  const fail = (err: unknown): void => {
    const m = errMsg(err);
    output.appendLine(`[error] ${m}`);
    vscode.window.showErrorMessage(`brain-dock: ${m}`);
  };

  const buildClient = async (): Promise<BrainDockClient | undefined> => {
    const apiKey = await getApiKey(secrets);
    return apiKey ? new BrainDockClient({ ...readSettings(), apiKey }) : undefined;
  };

  const loadState = async (periodDays: number): Promise<PanelState> => {
    const s = readSettings();
    const apiKey = await getApiKey(secrets);
    const state: PanelState = {
      lang: resolveLang(),
      configured: Boolean(apiKey),
      connected: false,
      serverUrl: s.serverUrl,
      mcpUrl: s.mcpUrl,
      project: s.project,
      languageSetting: vscode.workspace.getConfiguration(SECTION).get<string>('language') ?? 'auto',
      hasKey: Boolean(apiKey),
      hasWorkspace: Boolean(vscode.workspace.workspaceFolders?.length),
      settingsOpen: false,
      periodDays,
    };
    if (!apiKey) return state;
    const client = new BrainDockClient({ ...s, apiKey });
    try {
      const projects = await client.listProjects();
      state.connected = true;
      // Usage is non-critical: on failure log it and let the panel show "—" instead of zeros.
      state.usage = await client.getUsage(periodDays).catch((err: unknown) => {
        output.appendLine(`[usage] failed: ${errMsg(err)}`);
        return undefined;
      });
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

  const saveSettings = async (v: SettingsValues): Promise<void> => {
    const cfg = vscode.workspace.getConfiguration(SECTION);
    const g = vscode.ConfigurationTarget.Global;
    if (typeof v.serverUrl === 'string') await cfg.update('serverUrl', v.serverUrl.trim(), g);
    if (typeof v.mcpUrl === 'string') await cfg.update('mcpUrl', v.mcpUrl.trim(), g);
    // The active project is per-workspace (multiple windows must not clobber each other).
    if (typeof v.project === 'string') await setProject(v.project.trim());
    if (typeof v.language === 'string') await cfg.update('language', v.language, g);
    if (v.apiKey?.trim()) await storeApiKey(secrets, v.apiKey.trim());
    vscode.window.showInformationMessage(`brain-dock: ${t(resolveLang(), 'msg.settingsSaved')}`);
  };

  const provider = new PanelProvider(context.extensionUri, loadState, saveSettings);
  const refresh = () => provider.refresh();

  const register = (id: string, fn: () => void | Promise<void>): void => {
    context.subscriptions.push(vscode.commands.registerCommand(id, fn));
  };

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(PanelProvider.viewId, provider),
  );

  register('brainDock.refresh', refresh);

  // VEXP-style: the open folder IS the project. Find-or-create a project (by folder-name slug) and a
  // repository (root = the folder path the local worker reads), set it active, and index.
  const ensureWorkspaceProject = async (forceReindex: boolean, notify = true): Promise<void> => {
    const lang = resolveLang();
    const folders = vscode.workspace.workspaceFolders ?? [];
    const ws = folders[0];
    if (!ws) {
      if (notify) vscode.window.showInformationMessage(`brain-dock: ${t(lang, 'msg.noWorkspace')}`);
      return;
    }
    // Multi-root is not supported — only the first folder is indexed. Warn once per workspace.
    if (folders.length > 1 && !context.workspaceState.get<boolean>(MULTI_ROOT_WARNED_KEY)) {
      void context.workspaceState.update(MULTI_ROOT_WARNED_KEY, true);
      vscode.window.showWarningMessage(
        `brain-dock: ${t(lang, 'msg.multiRootOnlyFirst', { name: ws.name })}`,
      );
    }
    const client = await buildClient();
    if (!client) {
      if (notify) vscode.window.showWarningMessage(`brain-dock: ${t(lang, 'msg.setApiKeyFirst')}`);
      return;
    }
    const root = ws.uri.fsPath;
    const folder = ws.name || basename(root) || 'workspace';
    const slug = slugify(folder);
    const configuredProject = readSettings().project;
    provider.setError(undefined);
    provider.setBusy(t(lang, 'progress.provisioning'));
    try {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: t(lang, 'progress.provisioning') },
        async (progress) => {
          const projects = await client.listProjects();
          // Reuse the selected project if it still exists; only fall back to the folder-name slug
          // (creating a project) when nothing is configured — avoids spawning duplicate projects.
          let proj = pickProject(projects, configuredProject, slug);
          if (!proj) {
            try {
              proj = await client.createProject(folder, slug);
            } catch (err) {
              // Only a slug conflict warrants a retry with a random suffix.
              if (!(err instanceof ApiError) || err.status !== 409) throw err;
              proj = await client.createProject(
                folder,
                `${slug}-${Math.random().toString(36).slice(2, 6)}`,
              );
            }
          }
          await setProject(proj.slug);
          const repos = await client.listRepositories(proj.id);
          let repo = repos.find((r) => r.root === root) ?? repos.find((r) => r.alias === slug);
          let created = false;
          if (!repo) {
            repo = await client.createRepository(proj.id, { name: folder, alias: slug, root });
            created = true;
          }
          if (created || forceReindex) {
            output.appendLine('[index] collecting workspace files…');
            const { files, truncated } = await collectWorkspaceFiles(ws);
            if (truncated) {
              const warn = t(lang, 'msg.uploadTruncated', {
                mb: Math.round(UPLOAD_BUDGET_BYTES / (1024 * 1024)),
                n: files.length,
              });
              output.appendLine(`[index] ${warn}`);
              if (notify) vscode.window.showWarningMessage(`brain-dock: ${warn}`);
            }
            const msg = t(lang, 'progress.uploading', { n: files.length });
            progress.report({ message: msg });
            provider.setBusy(msg);
            output.appendLine(`[index] uploading ${files.length} files…`);
            const report = await client.indexFiles(proj.id, repo.id, files);
            output.appendLine(
              `[index] done: ${report.symbols} symbols / ${report.chunks} chunks / ${report.files} files`,
            );
          }
        },
      );
      if (notify) {
        vscode.window.showInformationMessage(
          `brain-dock: ${t(lang, 'msg.workspaceReady', { name: slug })}`,
        );
      }
    } catch (err) {
      if (notify) {
        fail(err);
      } else {
        // Background run (startup auto-index): no popups — log + surface in the panel instead.
        output.appendLine(`[error] ${errMsg(err)}`);
        provider.setError(errMsg(err));
      }
    } finally {
      provider.setBusy(undefined);
    }
  };

  // `indexWorkspace` and `reindex` (below) are deliberately the same implementation — both ids are
  // kept so existing user keybindings keep working.
  register('brainDock.indexWorkspace', () => ensureWorkspaceProject(true));

  register('brainDock.connect', async () => {
    const lang = resolveLang();
    const key = await vscode.window.showInputBox({
      title: t(lang, 'prompt.apiKeyTitle'),
      prompt: t(lang, 'prompt.apiKeyPrompt'),
      password: true,
      ignoreFocusOut: true,
    });
    if (!key) return;
    await storeApiKey(secrets, key.trim());
    vscode.window.showInformationMessage(`brain-dock: ${t(lang, 'msg.apiKeySaved')}`);
    await refresh();
  });

  register('brainDock.signOut', async () => {
    await clearApiKey(secrets);
    vscode.window.showInformationMessage(`brain-dock: ${t(resolveLang(), 'msg.signedOut')}`);
    await refresh();
  });

  register('brainDock.openSettings', () => {
    void vscode.commands.executeCommand('workbench.action.openSettings', 'brainDock');
  });

  register('brainDock.selectProject', async () => {
    const lang = resolveLang();
    const client = await buildClient();
    if (!client) {
      vscode.window.showWarningMessage(`brain-dock: ${t(lang, 'msg.setApiKeyFirst')}`);
      return;
    }
    try {
      const projects = await client.listProjects();
      if (projects.length === 0) {
        vscode.window.showInformationMessage(`brain-dock: ${t(lang, 'msg.noProjects')}`);
        return;
      }
      const pick = await vscode.window.showQuickPick(
        projects.map((p) => ({ label: p.slug, description: p.name, detail: p.id })),
        { title: t(lang, 'prompt.selectProject') },
      );
      if (!pick) return;
      await setProject(pick.label);
      await refresh();
    } catch (err) {
      fail(err);
    }
  });

  // Force Re-index = re-collect the open folder and re-upload it for server-side indexing.
  register('brainDock.reindex', () => ensureWorkspaceProject(true));

  register('brainDock.setupAgents', async () => {
    const lang = resolveLang();
    const s = readSettings();
    const apiKey = await getApiKey(secrets);
    if (!apiKey || !s.project) {
      vscode.window.showWarningMessage(`brain-dock: ${t(lang, 'msg.connectFirst')}`);
      return;
    }
    const items: Array<vscode.QuickPickItem & { target: AgentTarget }> = [
      { label: 'Claude Code — project (.mcp.json)', target: 'claude-project', picked: true },
      { label: 'Claude Code — global (~/.claude.json)', target: 'claude-global' },
      { label: 'Cursor — project (.cursor/mcp.json)', target: 'cursor-project' },
      { label: 'Cursor — global (~/.cursor/mcp.json)', target: 'cursor-global' },
    ];
    const picks = await vscode.window.showQuickPick(items, {
      title: t(lang, 'prompt.setupTitle'),
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
      `brain-dock: ${t(lang, 'msg.setupWrote', { n: written.length })}`,
      t(lang, 'msg.openFile'),
    );
    if (choice && written[0]) {
      void vscode.window.showTextDocument(vscode.Uri.file(written[0]));
    }
  });

  register('brainDock.generateContext', async () => {
    const lang = resolveLang();
    const s = readSettings();
    const client = await buildClient();
    if (!client || !s.project) {
      vscode.window.showWarningMessage(`brain-dock: ${t(lang, 'msg.connectFirst')}`);
      return;
    }
    const query = await vscode.window.showInputBox({
      title: t(lang, 'prompt.contextTitle'),
      prompt: t(lang, 'prompt.contextPrompt'),
      ignoreFocusOut: true,
    });
    if (!query) return;
    try {
      const text = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: t(lang, 'progress.generating') },
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
    const lang = resolveLang();
    const s = readSettings();
    const client = await buildClient();
    if (!client || !s.project) {
      vscode.window.showWarningMessage(`brain-dock: ${t(lang, 'msg.connectFirst')}`);
      return;
    }
    try {
      const proj = findProject(await client.listProjects(), s.project);
      if (!proj) {
        vscode.window.showErrorMessage(`brain-dock: ${t(lang, 'msg.projectNotFound')}`);
        return;
      }
      const alias = await vscode.window.showInputBox({
        title: t(lang, 'prompt.aliasTitle'),
        prompt: t(lang, 'prompt.aliasPrompt'),
        ignoreFocusOut: true,
      });
      if (!alias) return;
      const root = await vscode.window.showInputBox({
        title: t(lang, 'prompt.rootTitle'),
        prompt: t(lang, 'prompt.rootPrompt'),
        value: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '',
        ignoreFocusOut: true,
      });
      if (!root) return;
      const repo = await client.createRepository(proj.id, { name: alias, alias, root });
      output.appendLine(`[repo] created ${repo.alias} (${repo.root})`);
      const choice = await vscode.window.showInformationMessage(
        `brain-dock: ${t(lang, 'msg.repoAdded', { name: repo.alias })}`,
        t(lang, 'msg.reindexNow'),
      );
      if (choice) await client.reindex(proj.id, repo.id);
      await refresh();
    } catch (err) {
      fail(err);
    }
  });

  register('brainDock.viewLogs', () => output.show());

  // On startup, adopt the open folder as the project (unless brainDock.autoProject = false).
  // Creating a server-side project + uploading the folder is invasive, so ask once per workspace
  // first; "Never" permanently opts this workspace out.
  void (async () => {
    const autoProject =
      vscode.workspace.getConfiguration(SECTION).get<boolean>('autoProject') ?? true;
    if (!autoProject) return;
    if (!vscode.workspace.workspaceFolders?.length) return;
    if (!(await getApiKey(secrets))) return;
    const consent = context.workspaceState.get<string>(AUTO_INDEX_CONSENT_KEY);
    if (consent === 'never') return;
    if (consent !== 'yes') {
      const lang = resolveLang();
      const yes = t(lang, 'btn.autoIndexYes');
      const never = t(lang, 'btn.autoIndexNever');
      const choice = await vscode.window.showInformationMessage(
        `brain-dock: ${t(lang, 'msg.autoIndexAsk')}`,
        yes,
        never,
      );
      if (choice === never) {
        await context.workspaceState.update(AUTO_INDEX_CONSENT_KEY, 'never');
        return;
      }
      if (choice !== yes) return; // dismissed — ask again next startup
      await context.workspaceState.update(AUTO_INDEX_CONSENT_KEY, 'yes');
    }
    await ensureWorkspaceProject(false, false);
  })();
}

export function deactivate(): void {
  // nothing to dispose beyond context.subscriptions
}
