// Renders the sidebar webview HTML. VEXP-like layout using VS Code theme variables. Buttons post
// either a command id (data-cmd) or a panel action (data-action) back to the host. All visible text
// goes through i18n (state.lang). Settings are edited inline in the panel — no VS Code settings UI.
import type * as vscode from 'vscode';
import { type Lang, t } from '../i18n';
import type { IndexStatus, Repository, UsageSummary } from '../util';

export interface PanelState {
  lang: Lang;
  configured: boolean;
  connected: boolean;
  serverUrl: string;
  mcpUrl: string;
  project: string;
  languageSetting: string;
  hasKey: boolean;
  settingsOpen: boolean;
  status?: IndexStatus;
  repos?: Repository[];
  usage?: UsageSummary;
  error?: string;
}

interface Action {
  cmd?: string;
  action?: string;
  label: string;
  primary?: boolean;
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  return nonce;
}

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function button(a: Action): string {
  const cls = a.primary ? 'action primary' : 'action';
  const attr = a.cmd ? `data-cmd="${a.cmd}"` : `data-action="${a.action}"`;
  return `<button class="${cls}" ${attr}>${escapeHtml(a.label)}</button>`;
}

function renderSettings(state: PanelState): string {
  const L = state.lang;
  const langOptions: Array<[string, string]> = [
    ['auto', t(L, 'opt.langAuto')],
    ['en', 'English'],
    ['ru', 'Русский'],
  ];
  const options = langOptions
    .map(
      ([v, label]) =>
        `<option value="${v}"${state.languageSetting === v ? ' selected' : ''}>${escapeHtml(label)}</option>`,
    )
    .join('');
  const cancel = state.configured
    ? button({ action: 'cancelSettings', label: t(L, 'btn.cancel') })
    : '';
  const keyHint = state.hasKey
    ? `<div class="muted">🔑 ${escapeHtml(t(L, 'field.apiKeyKeep'))}</div>`
    : '';
  return `
    <div class="section">
      <div class="label">${t(L, 'label.settings')}</div>
      <label class="fld">${escapeHtml(t(L, 'field.serverUrl'))}
        <input id="f_serverUrl" value="${escapeHtml(state.serverUrl)}" spellcheck="false" /></label>
      <label class="fld">${escapeHtml(t(L, 'field.mcpUrl'))}
        <input id="f_mcpUrl" value="${escapeHtml(state.mcpUrl)}" spellcheck="false" /></label>
      <label class="fld">${escapeHtml(t(L, 'field.project'))}
        <input id="f_project" value="${escapeHtml(state.project)}" spellcheck="false" /></label>
      <label class="fld">${escapeHtml(t(L, 'field.language'))}
        <select id="f_language">${options}</select></label>
      <label class="fld">${escapeHtml(t(L, 'field.apiKey'))}
        <input id="f_apiKey" type="password" placeholder="bd_…" spellcheck="false" /></label>
      ${keyHint}
      ${button({ action: 'save', label: t(L, 'btn.save'), primary: true })}
      ${cancel}
    </div>`;
}

function renderStatus(state: PanelState): string {
  const L = state.lang;
  if (state.settingsOpen || !state.configured) return renderSettings(state);
  if (state.error) {
    return `<div class="error">${escapeHtml(state.error)}</div>
      <div class="hint">${escapeHtml(t(L, 'panel.serverHint', { url: state.serverUrl }))}</div>
      ${button({ cmd: 'brainDock.refresh', label: t(L, 'btn.retry'), primary: true })}
      ${button({ action: 'toggleSettings', label: t(L, 'btn.settings') })}
      ${button({ cmd: 'brainDock.signOut', label: t(L, 'btn.signOut') })}`;
  }
  if (!state.project) {
    return `<div class="hint">${escapeHtml(t(L, 'panel.pickProjectHint'))}</div>
      ${button({ cmd: 'brainDock.selectProject', label: t(L, 'btn.selectProject'), primary: true })}
      ${button({ action: 'toggleSettings', label: t(L, 'btn.settings') })}`;
  }
  return renderConnected(state);
}

function renderConnected(state: PanelState): string {
  const L = state.lang;
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
      <div class="row"><span class="label">${t(L, 'label.project')}</span>
        <button class="link" data-cmd="brainDock.selectProject">${t(L, 'btn.change')}</button></div>
      <div class="project">${escapeHtml(state.project)}</div>
    </div>

    <div class="section">
      <div class="label">${t(L, 'label.index')}</div>
      <div class="metrics">
        <div class="metric"><div class="n">${s.symbols}</div><div class="muted">${t(L, 'metric.symbols')}</div></div>
        <div class="metric"><div class="n">${s.files}</div><div class="muted">${t(L, 'metric.files')}</div></div>
        <div class="metric"><div class="n">${s.repos.length}</div><div class="muted">${t(L, 'metric.repos')}</div></div>
      </div>
      ${roleRows ? `<div class="roles">${roleRows}</div>` : ''}
    </div>

    <div class="section">
      <div class="label">${t(L, 'label.tokenSavings')} · ${state.usage?.days ?? 30}d</div>
      <div class="metrics">
        <div class="metric"><div class="n">${fmtCompact(state.usage?.estTokensSaved ?? 0)}</div><div class="muted">${t(L, 'metric.estSaved')}</div></div>
        <div class="metric"><div class="n">${state.usage?.avgSavingPct ?? 0}%</div><div class="muted">${t(L, 'metric.avgSaving')}</div></div>
        <div class="metric"><div class="n">${state.usage?.calls ?? 0}</div><div class="muted">${t(L, 'metric.calls')}</div></div>
      </div>
    </div>

    <div class="section">
      <div class="label">${t(L, 'label.actions')}</div>
      ${button({ cmd: 'brainDock.setupAgents', label: `⚙ ${t(L, 'btn.setupAgents')}`, primary: true })}
      ${button({ cmd: 'brainDock.reindex', label: `↻ ${t(L, 'btn.reindex')}` })}
      ${button({ cmd: 'brainDock.generateContext', label: `⬡ ${t(L, 'btn.generateContext')}` })}
      ${button({ cmd: 'brainDock.addRepository', label: `+ ${t(L, 'btn.addRepository')}` })}
      ${button({ cmd: 'brainDock.selectProject', label: `⌗ ${t(L, 'btn.switchProject')}` })}
      ${button({ cmd: 'brainDock.viewLogs', label: `≡ ${t(L, 'btn.viewLogs')}` })}
      ${button({ action: 'toggleSettings', label: `⚙ ${t(L, 'btn.settings')}` })}
    </div>

    ${repoRows ? `<div class="section"><div class="label">${t(L, 'label.repositories')}</div>${repoRows}</div>` : ''}`;
}

export function renderPanel(webview: vscode.Webview, state: PanelState): string {
  const nonce = getNonce();
  const L = state.lang;
  const dot = state.configured && state.connected && !state.error ? 'ok' : 'off';
  const dotLabel = !state.configured
    ? t(L, 'status.notConnected')
    : state.error
      ? t(L, 'status.error')
      : state.connected
        ? t(L, 'status.connected')
        : t(L, 'status.connecting');

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
  .fld { display: block; margin: 6px 0; font-size: 11px; color: var(--vscode-descriptionForeground); }
  .fld input, .fld select { display: block; width: 100%; box-sizing: border-box; margin-top: 3px;
    padding: 4px 6px; font-size: 12px; color: var(--vscode-input-foreground);
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, transparent); border-radius: 3px; }
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
    <span class="status"><span class="dot ${dot}"></span>${escapeHtml(dotLabel)}</span>
  </div>
  ${renderStatus(state)}
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const post = (m) => vscode.postMessage(m);
    const val = (id) => { const e = document.getElementById(id); return e ? e.value : undefined; };
    for (const el of document.querySelectorAll('[data-cmd]')) {
      el.addEventListener('click', () => post({ command: el.dataset.cmd }));
    }
    for (const el of document.querySelectorAll('[data-action]')) {
      el.addEventListener('click', () => {
        const a = el.dataset.action;
        if (a === 'save') {
          post({ type: 'saveSettings', values: {
            serverUrl: val('f_serverUrl'), mcpUrl: val('f_mcpUrl'), project: val('f_project'),
            language: val('f_language'), apiKey: val('f_apiKey'),
          } });
        } else {
          post({ type: a });
        }
      });
    }
  </script>
</body>
</html>`;
}
