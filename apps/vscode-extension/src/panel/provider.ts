import * as vscode from 'vscode';
import { type PanelState, renderPanel } from './html';

export interface SettingsValues {
  serverUrl?: string;
  mcpUrl?: string;
  project?: string;
  language?: string;
  apiKey?: string;
}

interface PanelMessage {
  command?: string;
  type?: 'toggleSettings' | 'cancelSettings' | 'saveSettings' | 'setPeriod';
  values?: SettingsValues;
  days?: number;
}

/** Hosts the sidebar webview, re-renders from a state loader, and handles inline settings edits. */
export class PanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'brainDock.panel';
  private view?: vscode.WebviewView;
  private settingsOpen = false;
  private periodDays = 1;
  private busy?: string;
  private lastError?: string;

  /** Show (or clear) a "busy" banner in the panel, e.g. while indexing. Pass undefined to clear. */
  setBusy(message?: string): void {
    this.busy = message;
    void this.refresh();
  }

  /** Surface (or clear) a background-task error in the panel without a popup. */
  setError(message?: string): void {
    this.lastError = message;
    void this.refresh();
  }

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly loadState: (periodDays: number) => Promise<PanelState>,
    private readonly onSave: (values: SettingsValues) => Promise<void>,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.onDidDispose(() => {
      this.view = undefined;
    });
    view.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };
    view.webview.onDidReceiveMessage(async (msg: PanelMessage) => {
      if (msg.type === 'toggleSettings') {
        this.settingsOpen = !this.settingsOpen;
        await this.refresh(true);
      } else if (msg.type === 'cancelSettings') {
        this.settingsOpen = false;
        await this.refresh(true);
      } else if (msg.type === 'saveSettings') {
        await this.onSave(msg.values ?? {});
        this.settingsOpen = false;
        await this.refresh(true);
      } else if (msg.type === 'setPeriod' && typeof msg.days === 'number') {
        this.periodDays = msg.days;
        await this.refresh();
      } else if (msg.command?.startsWith('brainDock.')) {
        // Allowlist: the webview may only trigger this extension's own commands.
        void vscode.commands.executeCommand(msg.command);
      }
    });
    void this.refresh(true);
  }

  async refresh(force = false): Promise<void> {
    // A full re-render wipes form input — skip background refreshes while settings are being edited.
    if (this.settingsOpen && !force) return;
    const view = this.view;
    if (!view) return;
    try {
      const state = await this.loadState(this.periodDays);
      state.settingsOpen = this.settingsOpen;
      state.busy = this.busy;
      if (!state.error && this.lastError) state.error = this.lastError;
      if (!this.view) return; // disposed while loading
      view.webview.html = renderPanel(view.webview, state);
    } catch {
      // view disposed mid-render or state load failed — nothing sensible to show
    }
  }
}
