// Renders the sidebar webview HTML. VEXP-like layout using VS Code theme variables; buttons
// post their command id back to the extension host.
import type * as vscode from 'vscode';
import type { IndexStatus, Repository } from '../util';

export interface PanelState {
  configured: boolean;
  connected: boolean;
  serverUrl: string;
  project: string;
  status?: IndexStatus;
  repos?: Repository[];
  error?: string;
}

interface Action {
  cmd: string;
  label: string;
  primary?: boolean;
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  return nonce;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function button(action: Action): string {
  const cls = action.primary ? 'action primary' : 'action';
  return `<button class="${cls}" data-cmd="${action.cmd}">${escapeHtml(action.label)}</button>`;
}

function renderStatus(state: PanelState): string {
  if (!state.configured) {
    return `<div class="hint">Not connected. Set your API key to begin.</div>
      ${button({ cmd: 'brainDock.connect', label: 'Connect (set API key)', primary: true })}
      ${button({ cmd: 'brainDock.openSettings', label: 'Settings' })}`;
  }
  if (state.error) {
    return `<div class="error">${escapeHtml(state.error)}</div>
      ${button({ cmd: 'brainDock.refresh', label: 'Retry', primary: true })}
      ${button({ cmd: 'brainDock.openSettings', label: 'Settings' })}
      ${button({ cmd: 'brainDock.signOut', label: 'Sign out' })}`;
  }
  if (!state.project) {
    return `<div class="hint">Connected. Pick a project to load its index.</div>
      ${button({ cmd: 'brainDock.selectProject', label: 'Select project', primary: true })}`;
  }
  return renderConnected(state);
}

function renderConnected(state: PanelState): string {
  const s = state.status ?? { files: 0, symbols: 0, repos: [], roles: {} };
  const roleRows = Object.entries(s.roles)
    .sort((a, b) => b[1] - a[1])
    .map(([role, n]) => `<div class="role"><span>${escapeHtml(role)}</span><b>${n}</b></div>`)
    .join('');
  const repoRows = (state.repos ?? [])
    .map(
      (r) =>
        `<div class="repo"><span class="dot"></span><div><b>${escapeHtml(r.alias)}</b>
          <div class="muted">${escapeHtml(r.root)}</div></div></div>`,
    )
    .join('');

  return `
    <div class="section">
      <div class="row"><span class="label">PROJECT</span>
        <button class="link" data-cmd="brainDock.selectProject">change</button></div>
      <div class="project">${escapeHtml(state.project)}</div>
    </div>

    <div class="section">
      <div class="label">INDEX</div>
      <div class="metrics">
        <div class="metric"><div class="n">${s.symbols}</div><div class="muted">symbols</div></div>
        <div class="metric"><div class="n">${s.files}</div><div class="muted">files</div></div>
        <div class="metric"><div class="n">${s.repos.length}</div><div class="muted">repos</div></div>
      </div>
      ${roleRows ? `<div class="roles">${roleRows}</div>` : ''}
    </div>

    <div class="section">
      <div class="label">ACTIONS</div>
      ${button({ cmd: 'brainDock.setupAgents', label: '⚙ Setup Agents', primary: true })}
      ${button({ cmd: 'brainDock.reindex', label: '↻ Force Re-index' })}
      ${button({ cmd: 'brainDock.selectProject', label: '⌗ Switch Project' })}
      ${button({ cmd: 'brainDock.openSettings', label: '⚙ Settings' })}
    </div>

    ${
      repoRows ? `<div class="section"><div class="label">REPOSITORIES</div>${repoRows}</div>` : ''
    }`;
}

export function renderPanel(webview: vscode.Webview, state: PanelState): string {
  const nonce = getNonce();
  const dot = state.configured && state.connected && !state.error ? 'ok' : 'off';
  const dotLabel = !state.configured
    ? 'not connected'
    : state.error
      ? 'error'
      : state.connected
        ? 'connected'
        : 'connecting…';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground);
    padding: 8px 10px; font-size: 12px; }
  .header { display: flex; align-items: center; justify-content: space-between;
    font-weight: 600; font-size: 13px; margin-bottom: 6px; }
  .status { display: flex; align-items: center; gap: 6px; color: var(--vscode-descriptionForeground);
    font-weight: 400; font-size: 11px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block;
    background: var(--vscode-charts-green); }
  .dot.off { background: var(--vscode-descriptionForeground); }
  .section { border-top: 1px solid var(--vscode-panel-border); padding: 10px 0; }
  .label { color: var(--vscode-descriptionForeground); font-size: 10px; letter-spacing: .08em;
    text-transform: uppercase; margin-bottom: 6px; }
  .row { display: flex; justify-content: space-between; align-items: center; }
  .project { font-size: 13px; font-weight: 600; }
  .metrics { display: flex; gap: 14px; }
  .metric .n { font-size: 18px; font-weight: 700; }
  .muted { color: var(--vscode-descriptionForeground); font-size: 11px; }
  .roles { margin-top: 8px; display: grid; grid-template-columns: 1fr 1fr; gap: 2px 14px; }
  .role { display: flex; justify-content: space-between; font-size: 11px;
    color: var(--vscode-descriptionForeground); }
  .role b { color: var(--vscode-foreground); }
  .repo { display: flex; gap: 8px; align-items: flex-start; padding: 4px 0; }
  .repo .dot { margin-top: 4px; }
  button.action { display: block; width: 100%; text-align: left; margin: 4px 0;
    padding: 6px 10px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;
    color: var(--vscode-foreground); background: var(--vscode-button-secondaryBackground); }
  button.action:hover { background: var(--vscode-button-secondaryHoverBackground); }
  button.action.primary { color: var(--vscode-button-foreground);
    background: var(--vscode-button-background); }
  button.action.primary:hover { background: var(--vscode-button-hoverBackground); }
  button.link { background: none; border: none; cursor: pointer; font-size: 11px;
    color: var(--vscode-textLink-foreground); padding: 0; }
  .hint { color: var(--vscode-descriptionForeground); margin-bottom: 8px; }
  .error { color: var(--vscode-errorForeground); margin-bottom: 8px; word-break: break-word; }
</style>
</head>
<body>
  <div class="header">
    <span>brain-dock</span>
    <span class="status"><span class="dot ${dot}"></span>${dotLabel}</span>
  </div>
  ${renderStatus(state)}
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    for (const btn of document.querySelectorAll('[data-cmd]')) {
      btn.addEventListener('click', () => vscode.postMessage({ command: btn.dataset.cmd }));
    }
  </script>
</body>
</html>`;
}
