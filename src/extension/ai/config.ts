import * as vscode from 'vscode';

/**
 * Checks if AI features are enabled in the user's settings.
 * Every AI-touching code path must check this before making network calls.
 */
export function isAiEnabled(): boolean {
  return vscode.workspace.getConfiguration('gitsnap').get<boolean>('ai.enabled', true) ?? true;
}

/**
 * Returns the configured AI provider (e.g., 'groq', 'openai').
 */
export function getConfiguredProvider(): string {
  return vscode.workspace.getConfiguration('gitsnap').get<string>('ai.provider', 'groq') ?? 'groq';
}