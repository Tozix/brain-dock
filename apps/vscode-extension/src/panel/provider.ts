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
  type?: 'toggleSettings' | 'cancelSettings' | 'saveSettings';
  values?: SettingsValues;
}

/** Hosts the sidebar webview, re-renders from a state loader, and handles inline settings edits. */
export class PanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'brainDock.panel';
  private view?: vscode.WebviewView;
  private settingsOpen = false;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly loadState: () => Promise<PanelState>,
    private readonly onSave: (values: SettingsValues) => Promise<void>,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };
    view.webview.onDidReceiveMessage(async (msg: PanelMessage) => {
      if (msg.type === 'toggleSettings') {
        this.settingsOpen = !this.settingsOpen;
        await this.refresh();
      } else if (msg.type === 'cancelSettings') {
        this.settingsOpen = false;
        await this.refresh();
      } else if (msg.type === 'saveSettings') {
        await this.onSave(msg.values ?? {});
        this.settingsOpen = false;
        await this.refresh();
      } else if (msg.command) {
        void vscode.commands.executeCommand(msg.command);
      }
    });
    void this.refresh();
  }

  async refresh(): Promise<void> {
    if (!this.view) return;
    const state = await this.loadState();
    state.settingsOpen = this.settingsOpen;
    this.view.webview.html = renderPanel(this.view.webview, state);
  }
}
