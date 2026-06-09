// Settings + secret storage. The API key lives in SecretStorage (never in settings.json).
import * as vscode from 'vscode';

export const SECTION = 'brainDock';
const API_KEY_SECRET = 'brainDock.apiKey';

export interface Settings {
  serverUrl: string;
  mcpUrl: string;
  project: string;
}

export function readSettings(): Settings {
  const cfg = vscode.workspace.getConfiguration(SECTION);
  return {
    serverUrl: (cfg.get<string>('serverUrl') ?? 'http://localhost:3000').trim(),
    mcpUrl: (cfg.get<string>('mcpUrl') ?? 'http://localhost:8080/mcp').trim(),
    project: (cfg.get<string>('project') ?? '').trim(),
  };
}

export async function setProject(project: string): Promise<void> {
  await vscode.workspace
    .getConfiguration(SECTION)
    .update('project', project, vscode.ConfigurationTarget.Global);
}

export function getApiKey(secrets: vscode.SecretStorage): Thenable<string | undefined> {
  return secrets.get(API_KEY_SECRET);
}

export function storeApiKey(secrets: vscode.SecretStorage, key: string): Thenable<void> {
  return secrets.store(API_KEY_SECRET, key);
}

export function clearApiKey(secrets: vscode.SecretStorage): Thenable<void> {
  return secrets.delete(API_KEY_SECRET);
}
