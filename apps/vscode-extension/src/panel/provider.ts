import * as vscode from 'vscode';
import { type PanelState, renderPanel } from './html';

/** Hosts the sidebar webview and re-renders it from a caller-supplied state loader. */
export class PanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'brainDock.panel';
  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly loadState: () => Promise<PanelState>,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };
    view.webview.onDidReceiveMessage((msg: { command?: string }) => {
      if (msg.command) void vscode.commands.executeCommand(msg.command);
    });
    void this.refresh();
  }

  async refresh(): Promise<void> {
    if (!this.view) return;
    this.view.webview.html = renderPanel(this.view.webview, await this.loadState());
  }
}
