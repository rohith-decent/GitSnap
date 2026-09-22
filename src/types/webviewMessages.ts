import type { BranchInfo, LogCommitInfo, StashInfo, WorktreeInfo, RebaseCommitInfo } from '../extension/git';

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
  // Phase 5:
  | { type: 'requestCommitEditorData' }
  | { type: 'requestAiSuggestion' }
  | { type: 'confirmCommitAndPush'; payload: { message: string } }
  // Phase 8:
  | { type: 'requestLogExplorer'; payload?: { author?: string; grep?: string; branch?: string } }
  | { type: 'requestStashes' }
  | { type: 'createStash'; payload: { message?: string } }
  | { type: 'applyStash'; payload: { ref: string } }
  | { type: 'dropStash'; payload: { ref: string } }
  | { type: 'popStash'; payload: { ref: string } }
  | { type: 'requestStashDiff'; payload: { ref: string } }
  | { type: 'requestStashAiSummary'; payload: { ref: string } }
  | { type: 'cherryPickCommit'; payload: { sha: string } }
  | { type: 'requestRebasePreview'; payload: { baseBranch: string } }
  | { type: 'requestWorktrees' }
  | { type: 'createWorktree'; payload: { path: string; branch: string } }
  // Phase 9:
  | { type: 'requestPrPrepData'; payload?: { baseBranch?: string } }
  | { type: 'generatePrDescription'; payload: { baseBranch: string } };

// Messages sent FROM the extension host TO the webview
export type ExtensionToWebviewMessage =
  | { type: 'settingsLoaded'; payload: { apiKey?: string; model?: string } }
  | { type: 'branchesLoaded'; payload: { branches: BranchInfo[] } }
  | { type: 'branchActionComplete'; payload: { success: boolean; message: string } }
  | { type: 'error'; payload: { message: string } }
  // Phase 5:
  | { type: 'commitEditorDataLoaded'; payload: { diff: string; initialMessage: string; aiEnabled: boolean } }
  | { type: 'aiSuggestionLoaded'; payload: { message: string } }
  | { type: 'commitActionComplete'; payload: { success: boolean; message: string } }
  // Phase 8:
  | { type: 'logExplorerLoaded'; payload: { commits: LogCommitInfo[] } }
  | { type: 'stashesLoaded'; payload: { stashes: StashInfo[] } }
  | { type: 'stashDiffLoaded'; payload: { ref: string; diff: string } }
  | { type: 'stashAiSummaryLoaded'; payload: { ref: string; summary: string } }
  | { type: 'rebasePreviewLoaded'; payload: { baseBranch: string; commits: RebaseCommitInfo[] } }
  | { type: 'worktreesLoaded'; payload: { worktrees: WorktreeInfo[] } }
  | { type: 'toolkitActionComplete'; payload: { success: boolean; message: string } }
  // Phase 9:
  | { type: 'prPrepDataLoaded'; payload: { branches: BranchInfo[]; currentBranch: string; commits: LogCommitInfo[] } }
  | { type: 'prDescriptionGenerated'; payload: { title: string; body: string } };