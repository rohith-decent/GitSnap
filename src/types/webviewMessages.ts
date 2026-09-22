// src/types/webviewMessages.ts
import type { BranchInfo } from '../extension/git';

// Messages sent FROM the webview TO the extension host
export type WebviewToExtensionMessage =
  | { type: 'requestSettings' }
  | { type: 'saveApiKey'; payload: string }
  | { type: 'saveModel'; payload: string }
  | { type: 'requestBranches' }
  | { type: 'switchBranch'; payload: { name: string } }
  | { type: 'createBranch'; payload: { name: string; from?: string } }
  | { type: 'deleteBranch'; payload: { name: string; force: boolean } }
  | { type: 'fetchAll' }
  // Phase 5 additions:
  | { type: 'requestCommitEditorData' }
  | { type: 'requestAiSuggestion' }
  | { type: 'confirmCommitAndPush'; payload: { message: string } };

// Messages sent FROM the extension host TO the webview
export type ExtensionToWebviewMessage =
  | { type: 'settingsLoaded'; payload: { apiKey?: string; model?: string } }
  | { type: 'branchesLoaded'; payload: { branches: BranchInfo[] } }
  | { type: 'branchActionComplete'; payload: { success: boolean; message: string } }
  | { type: 'error'; payload: { message: string } }
  // Phase 5 additions:
  | { type: 'commitEditorDataLoaded'; payload: { diff: string; initialMessage: string; aiEnabled: boolean } }
  | { type: 'aiSuggestionLoaded'; payload: { message: string } }
  | { type: 'commitActionComplete'; payload: { success: boolean; message: string } };