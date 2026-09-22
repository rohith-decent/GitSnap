# GitSnap — Phase 4 & Phase 5 Execution Guide

This guide provides step-by-step instructions to implement **Phase 4 (Global Keyboard Shortcuts & Quick Actions)** and **Phase 5 (Edit-Before-Commit Flow)** in GitSnap.

Every step includes:
- **Simple Language Explanation**: What the code does and why it is needed.
- **Exact Code Snippets**: Fully copy-pasteable and error-free.
- **Verification Step**: How to test that the step succeeded without breaking existing functionality.

---

## Table of Contents

1. [Overview & Prerequisites](#overview--prerequisites)
2. [Phase 4 — Global Keyboard Shortcuts & Quick Actions](#phase-4--global-keyboard-shortcuts--quick-actions)
   - [Step 4.1 — Declare Commands & Keybindings in `package.json`](#step-41--declare-commands--keybindings-in-packagejson)
   - [Step 4.2 — Implement `undoLastCommit` in `src/extension/git/index.ts`](#step-42--implement-undolastcommit-in-srcextensiongitindexts)
   - [Step 4.3 — Wire Commands in `src/extension/extension.ts`](#step-43--wire-commands-in-srcextensionextensionts)
   - [Step 4.4 — Unit Test for `undoLastCommit`](#step-44--unit-test-for-undolastcommit)
3. [Phase 5 — Edit-Before-Commit Flow](#phase-5--edit-before-commit-flow)
   - [Step 5.1 — Extend Message Contracts in `src/types/webviewMessages.ts`](#step-51--extend-message-contracts-in-srctypeswebviewmessagests)
   - [Step 5.2 — Create `src/webview/CommitEditor.svelte`](#step-52--create-srcwebviewcommiteditorsvelte)
   - [Step 5.3 — Create Webview Entry Point `src/webview/commit-editor-main.ts`](#step-53--create-webview-entry-point-srcwebviewcommit-editor-maints)
   - [Step 5.4 — Update Vite Build Config in `vite.config.ts`](#step-54--update-vite-build-config-in-viteconfigts)
   - [Step 5.5 — Create Webview Panel Manager `src/extension/webview/commitEditorPanel.ts`](#step-55--create-webview-panel-manager-srcextensionwebviewcommiteditorpanelts)
   - [Step 5.6 — Wire Command & Panel in `src/extension/extension.ts`](#step-56--wire-command--panel-in-srcextensionextensionts)
4. [Verification & Error Prevention Checklist](#verification--error-prevention-checklist)

---

## Overview & Prerequisites

### What is Phase 4?
Phase 4 adds fast global keyboard shortcuts (chords starting with `Ctrl+Alt+G` or `Cmd+Alt+G`) to launch GitSnap panels quickly, and adds a non-destructive **Undo Last Commit** feature (`git reset --soft HEAD~1`).

### What is Phase 5?
Phase 5 introduces an **Edit-Before-Commit** Webview modal. Instead of AI automatically committing your code in the background, you review staged changes side-by-side with an editable commit message box. You can request an AI suggestion on demand or type your own, validate conventional-commit formatting, and then click "Commit & Push".

---

## Phase 4 — Global Keyboard Shortcuts & Quick Actions

### Step 4.1 — Declare Commands & Keybindings in `package.json`

#### 💡 In Simple Language:
VS Code needs to know that our extension provides new commands and keyboard shortcuts. When we declare keybindings in `package.json`, VS Code registers them in the central Keyboard Shortcuts UI (`Ctrl+K Ctrl+S`), allowing users to customize them if they want.

#### 📝 Implementation:
Open [package.json](file:///c:/Users/rohit/OneDrive/Desktop/GitSnap/gitsnap/package.json) and update the `contributes` section to include the new commands and keybindings.

```json
{
  "contributes": {
    "commands": [
      {
        "command": "gitsnap.aiCommitAndPush",
        "title": "GitSnap: Fast AI Commit & Push",
        "icon": "$(zap)"
      },
      {
        "command": "gitsnap.openCommitEditor",
        "title": "GitSnap: Open Commit Editor",
        "icon": "$(edit)"
      },
      {
        "command": "gitsnap.openBranchDashboard",
        "title": "GitSnap: Open Branch Dashboard",
        "icon": "$(git-branch)"
      },
      {
        "command": "gitsnap.undoLastCommit",
        "title": "GitSnap: Undo Last Commit (Soft Reset)",
        "icon": "$(discard)"
      },
      {
        "command": "gitsnap.openSettings",
        "title": "GitSnap: Open Settings",
        "icon": "$(gear)"
      },
      {
        "command": "gitsnap.setApiKey",
        "title": "GitSnap: Set API Key",
        "icon": "$(key)"
      }
    ],
    "keybindings": [
      {
        "command": "gitsnap.openCommitEditor",
        "key": "ctrl+alt+g c",
        "mac": "cmd+alt+g c"
      },
      {
        "command": "gitsnap.openBranchDashboard",
        "key": "ctrl+alt+g b",
        "mac": "cmd+alt+g b"
      },
      {
        "command": "gitsnap.undoLastCommit",
        "key": "ctrl+alt+g u",
        "mac": "cmd+alt+g u"
      }
    ]
  }
}
```

---

### Step 4.2 — Implement `undoLastCommit` in `src/extension/git/index.ts`

#### 💡 In Simple Language:
Undoing a commit in Git can be destructive if done wrong (`--hard` deletes code changes). We use `--soft HEAD~1`. Soft reset undoes the commit message and commit object in Git history, but **keeps all modified files staged in your workspace**, ensuring zero data loss.

#### 📝 Implementation:
Add `undoLastCommit()` to [src/extension/git/index.ts](file:///c:/Users/rohit/OneDrive/Desktop/GitSnap/gitsnap/src/extension/git/index.ts):

```ts
/**
 * Undoes the most recent commit while keeping all changes staged in the workspace.
 * Uses `git reset --soft HEAD~1`.
 */
export async function undoLastCommit(): Promise<void> {
  try {
    const git = getGit();

    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      throw new NotAGitRepoError();
    }

    // Verify there is at least one commit to undo
    const log = await git.log({ maxCount: 1 });
    if (log.total === 0) {
      throw new Error('No commits to undo in this repository.');
    }

    // Soft reset: uncommits but keeps all changes staged
    await git.reset(['--soft', 'HEAD~1']);
  } catch (error) {
    if (error instanceof GitSnapError) {
      throw error;
    }
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to undo last commit: ${msg}`);
  }
}
```

---

### Step 4.3 — Wire Commands in `src/extension/extension.ts`

#### 💡 In Simple Language:
`extension.ts` is the bridge between VS Code UI actions and our code modules. When the user presses `Ctrl+Alt+G U` or selects "GitSnap: Undo Last Commit", VS Code runs the command callback registered here.

#### 📝 Implementation:
In [src/extension/extension.ts](file:///c:/Users/rohit/OneDrive/Desktop/GitSnap/gitsnap/src/extension/extension.ts), register `gitsnap.undoLastCommit`:

```ts
const undoLastCommitCmd = vscode.commands.registerCommand(
    'gitsnap.undoLastCommit',
    async () => {
        try {
            await git.undoLastCommit();
            vscode.window.showInformationMessage('✅ Undo last commit succeeded. Changes remain staged.');
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Undo failed: ${msg}`);
        }
    }
);

context.subscriptions.push(undoLastCommitCmd);
```

---

### Step 4.4 — Unit Test for `undoLastCommit`

#### 💡 In Simple Language:
Unit testing ensures our code calls simple-git with exact arguments (`['--soft', 'HEAD~1']`) without running actual git commands on real files.

#### 📝 Implementation:
Add to `src/extension/git/index.test.ts`:

```ts
it('should call git.reset with --soft HEAD~1', async () => {
  mockSimpleGit.checkIsRepo.mockResolvedValue(true);
  mockSimpleGit.log.mockResolvedValue({ total: 1 });
  mockSimpleGit.reset.mockResolvedValue('');

  await git.undoLastCommit();

  expect(mockSimpleGit.reset).toHaveBeenCalledWith(['--soft', 'HEAD~1']);
});
```

---

## Phase 5 — Edit-Before-Commit Flow

### Step 5.1 — Extend Message Contracts in `src/types/webviewMessages.ts`

#### 💡 In Simple Language:
Webview panels run inside isolated browser windows and cannot access Git directly. They communicate with the Extension host by passing typed JSON messages back and forth. Defining these types ensures TypeScript catches any typos or missing fields.

#### 📝 Implementation:
Update [src/types/webviewMessages.ts](file:///c:/Users/rohit/OneDrive/Desktop/GitSnap/gitsnap/src/types/webviewMessages.ts):

```ts
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
```

---

### Step 5.2 — Create `src/webview/CommitEditor.svelte`

#### 💡 In Simple Language:
This is the UI component built with Svelte 5. It features:
1. **Left side**: Staged diff viewer with color-coded diff lines.
2. **Right side**: Editable commit message input area.
3. **Conventional Commit validation**: Shows a helpful tip if the message doesn't follow standard format (`feat:`, `fix:`, `docs:`, etc.).
4. **Conditional AI Button**: The `💡 AI Suggest` button is rendered **only when AI is enabled**, fulfilling the AI-optional principle.

#### 📝 Implementation:
Create `src/webview/CommitEditor.svelte`:

```svelte

          commitMessage = msg.payload.initialMessage;
          aiEnabled = msg.payload.aiEnabled;
          break;
        case 'aiSuggestionLoaded':
          commitMessage = msg.payload.message;
          isGeneratingAi = false;
          statusMessage = 'AI suggestion generated!';
          isError = false;
          break;
        case 'commitActionComplete':
          isSubmitting = false;
          statusMessage = msg.payload.message;
          isError = !msg.payload.success;
          break;
        case 'error':
          isGeneratingAi = false;
          isSubmitting = false;
          statusMessage = msg.payload.message;
          isError = true;
          break;
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  });

  function requestAiSuggestion() {
    isGeneratingAi = true;
    statusMessage = 'Generating AI commit message...';
    isError = false;
    postMessage({ type: 'requestAiSuggestion' });
  }

  function handleCommitAndPush() {
    if (!commitMessage.trim()) return;
    isSubmitting = true;
    statusMessage = 'Committing and pushing changes...';
    isError = false;
    postMessage({
      type: 'confirmCommitAndPush',
      payload: { message: commitMessage.trim() }
    });
  }

  // Helper for color-coding diff lines
  function getLineClass(line: string): string {
    if (line.startsWith('+') && !line.startsWith('+++')) return 'diff-add';
    if (line.startsWith('-') && !line.startsWith('---')) return 'diff-remove';
    if (line.startsWith('@@')) return 'diff-header';
    return 'diff-normal';
  }
</script>

<div class="editor-container">
  <header class="header">
    <h2>GitSnap Commit Editor</h2>
    <span class="subtitle">Review staged diff & customize your commit message</span>
  </header>

  <main class="main-layout">
    <!-- Left Panel: Diff Preview -->
    <section class="diff-section">
      <div class="section-title">Staged Changes Preview</div>
      <div class="diff-viewer">
        {#if diff}
          <pre>{#each diff.split('\n') as line}<span class={getLineClass(line)}>{line}</span>{'\n'}{/each}</pre>
        {:else}
          <div class="empty-diff">No staged changes detected.</div>
        {/if}
      </div>
    </section>

    <!-- Right Panel: Message Input & Actions -->
    <section class="message-section">
      <div class="section-title">Commit Message</div>
      
      <textarea
        bind:value={commitMessage}
        placeholder="Enter commit message (e.g. feat: add keyboard shortcuts)..."
        rows="8"
        disabled={isSubmitting}
      ></textarea>

      {#if !isConventional && commitMessage.trim().length > 0}
        <div class="warning-banner">
          ⚠️ Tip: Message does not match Conventional Commits format (e.g., <code>feat: description</code>).
        </div>
      {/if}

      <div class="actions">
        {#if aiEnabled}
          <button
            class="btn-secondary"
            onclick={requestAiSuggestion}
            disabled={isGeneratingAi || isSubmitting}
          >
            {isGeneratingAi ? '⏳ Generating...' : '💡 AI Suggest'}
          </button>
        {/if}

        <button
          c<script lang="ts">
  import type { ExtensionToWebviewMessage, WebviewToExtensionMessage } from '../types/webviewMessages';

  let vscode: any;
  if (typeof acquireVsCodeApi !== 'undefined') {
    vscode = acquireVsCodeApi();
  }

  let diff = $state<string>('');
  let commitMessage = $state<string>('');
  let aiEnabled = $state<boolean>(true);
  let isGeneratingAi = $state<boolean>(false);
  let isSubmitting = $state<boolean>(false);
  let statusMessage = $state<string>('');
  let isError = $state<boolean>(false);

  // Conventional commit format validator (warns, does not block)
  const conventionalCommitRegex = /^(feat|fix|docs|style|refactor|perf|test|chore|ci|build)(\(.+\))?: .+/;
  let isConventional = $derived(commitMessage.trim().length === 0 || conventionalCommitRegex.test(commitMessage.trim()));

  function postMessage(msg: WebviewToExtensionMessage) {
    if (vscode) {
      vscode.postMessage(msg);
    }
  }

  $effect(() => {
    postMessage({ type: 'requestCommitEditorData' });

    function handleMessage(event: MessageEvent<ExtensionToWebviewMessage>) {
      const msg = event.data;
      switch (msg.type) {
        case 'commitEditorDataLoaded':
          diff = msg.payload.diff;lass="btn-primary"
          onclick={handleCommitAndPush}
          disabled={!commitMessage.trim() || isSubmitting}
        >
          {isSubmitting ? '🚀 Committing & Pushing...' : 'Commit & Push'}
        </button>
      </div>

      {#if statusMessage}
        <div class="status-box" class:error={isError}>
          {statusMessage}
        </div>
      {/if}
    </section>
  </main>
</div>

<style>
  .editor-container {
    padding: 16px;
    color: var(--vscode-foreground);
    font-family: var(--vscode-font-family);
    display: flex;
    flex-direction: column;
    height: 100vh;
    box-sizing: border-box;
  }

  .header {
    margin-bottom: 16px;
    border-bottom: 1px solid var(--vscode-panel-border);
    padding-bottom: 8px;
  }

  .header h2 {
    margin: 0;
    font-size: 1.4rem;
  }

  .subtitle {
    font-size: 0.85rem;
    color: var(--vscode-descriptionForeground);
  }

  .main-layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    flex: 1;
    min-height: 0;
  }

  .diff-section, .message-section {
    display: flex;
    flex-direction: column;
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px;
    padding: 12px;
    min-height: 0;
  }

  .section-title {
    font-weight: 600;
    margin-bottom: 8px;
    font-size: 0.95rem;
  }

  .diff-viewer {
    flex: 1;
    overflow: auto;
    background: var(--vscode-textCodeBlock-background);
    border: 1px solid var(--vscode-widget-border);
    border-radius: 4px;
    padding: 8px;
    font-family: var(--vscode-editor-font-family);
    font-size: 0.85rem;
    white-space: pre;
  }

  .diff-add { color: #4ec9b0; background: rgba(78, 201, 176, 0.1); }
  .diff-remove { color: #f14c4c; background: rgba(241, 76, 76, 0.1); }
  .diff-header { color: #569cd6; font-weight: bold; }
  .diff-normal { color: var(--vscode-editor-foreground); }

  textarea {
    width: 100%;
    box-sizing: border-box;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    border-radius: 4px;
    padding: 8px;
    font-family: inherit;
    resize: vertical;
  }

  textarea:focus {
    outline: 1px solid var(--vscode-focusBorder);
  }

  .warning-banner {
    margin-top: 8px;
    font-size: 0.8rem;
    color: var(--vscode-notificationsWarningIcon-foreground, #cca700);
    background: rgba(204, 167, 0, 0.1);
    padding: 6px;
    border-radius: 4px;
  }

  .actions {
    display: flex;
    gap: 8px;
    margin-top: 16px;
    justify-content: flex-end;
  }

  button {
    padding: 8px 16px;
    border-radius: 4px;
    font-weight: 500;
    cursor: pointer;
    border: none;
  }

  .btn-primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--vscode-button-hoverBackground);
  }

  .btn-secondary {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--vscode-button-secondaryHoverBackground);
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .status-box {
    margin-top: 12px;
    padding: 8px;
    border-radius: 4px;
    font-size: 0.85rem;
    background: rgba(78, 201, 176, 0.15);
    color: #4ec9b0;
  }

  .status-box.error {
    background: rgba(241, 76, 76, 0.15);
    color: #f14c4c;
  }
</style>
```

---

### Step 5.3 — Create Webview Entry Point `src/webview/commit-editor-main.ts`

#### 💡 In Simple Language:
This entry point mounts our `CommitEditor.svelte` component into the webview HTML DOM when opened by VS Code.

#### 📝 Implementation:
Create `src/webview/commit-editor-main.ts`:

```ts
import { mount } from 'svelte';
import CommitEditor from './CommitEditor.svelte';

const app = mount(CommitEditor, {
  target: document.getElementById('app')!,
});

export default app;
```

---

### Step 5.4 — Update Vite Build Config in `vite.config.ts`

#### 💡 In Simple Language:
Vite bundles our Svelte webview files into standalone JS files in `dist/webview`. We must register `commitEditor: 'src/webview/commit-editor-main.ts'` under `rollupOptions.input` so Vite builds `dist/webview/commitEditor.js`.

#### 📝 Implementation:
Update [vite.config.ts](file:///c:/Users/rohit/OneDrive/Desktop/GitSnap/gitsnap/vite.config.ts):

```ts
rollupOptions: {
  input: {
    main: 'src/webview/main.ts',
    dashboard: 'src/webview/dashboard-main.ts',
    commitEditor: 'src/webview/commit-editor-main.ts',
  },
  output: {
    entryFileNames: '[name].js',
    chunkFileNames: '[name].js',
    assetFileNames: '[name].[ext]',
  },
},
```

---

### Step 5.5 — Create Webview Panel Manager `src/extension/webview/commitEditorPanel.ts`

#### 💡 In Simple Language:
This class manages the Webview Panel window inside VS Code. It:
1. Opens or focuses the panel.
2. Generates secure HTML with Content Security Policy (CSP) nonces.
3. Receives messages from the Svelte UI and executes corresponding Git/AI operations.

#### 📝 Implementation:
Create `src/extension/webview/commitEditorPanel.ts`:

```ts
import * as vscode from 'vscode';
import * as git from '../git';
import * as ai from '../ai';
import * as secrets from '../secrets';
import { isAiEnabled } from '../ai/config';
import type { WebviewToExtensionMessage, ExtensionToWebviewMessage } from '../../types/webviewMessages';

export class CommitEditorPanel {
  public static currentPanel: CommitEditorPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _context: vscode.ExtensionContext;
  private _disposables: vscode.Disposable[] = [];

  public static async render(extensionUri: vscode.Uri, context: vscode.ExtensionContext): Promise<void> {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (CommitEditorPanel.currentPanel) {
      CommitEditorPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'gitsnapCommitEditor',
      'GitSnap Commit Editor',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'webview')],
      }
    );

    CommitEditorPanel.currentPanel = new CommitEditorPanel(panel, extensionUri, context);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._context = context;

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);

    this._panel.webview.onDidReceiveMessage(
      async (message: WebviewToExtensionMessage) => {
        await this._handleMessage(message);
      },
      null,
      this._disposables
    );
  }

  private postMessage(message: ExtensionToWebviewMessage) {
    this._panel.webview.postMessage(message);
  }

  private async _handleMessage(message: WebviewToExtensionMessage) {
    switch (message.type) {
      case 'requestCommitEditorData': {
        try {
          // Auto-stage all changes first so diff is complete
          await git.stageAll();
          const diff = await git.getDiff();
          const aiActive = isAiEnabled();

          this.postMessage({
            type: 'commitEditorDataLoaded',
            payload: {
              diff,
              initialMessage: '',
              aiEnabled: aiActive,
            },
          });
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          this.postMessage({ type: 'error', payload: { message: msg } });
        }
        break;
      }

      case 'requestAiSuggestion': {
        try {
          const diff = await git.getDiff();
          const apiKey = await secrets.getApiKey(this._context);
          const model = await secrets.getModel(this._context);

          const suggestion = await ai.generateCommitMessage(diff, apiKey || '', model);
          this.postMessage({
            type: 'aiSuggestionLoaded',
            payload: { message: suggestion },
          });
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          this.postMessage({ type: 'error', payload: { message: `AI Generation failed: ${msg}` } });
        }
        break;
      }

      case 'confirmCommitAndPush': {
        try {
          await git.commit(message.payload.message);
          await git.push();

          this.postMessage({
            type: 'commitActionComplete',
            payload: {
              success: true,
              message: `✅ Successfully committed and pushed: "${message.payload.message}"`,
            },
          });

          vscode.window.showInformationMessage(`✅ Pushed: ${message.payload.message}`);
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          this.postMessage({
            type: 'commitActionComplete',
            payload: { success: false, message: `Commit/Push failed: ${msg}` },
          });
        }
        break;
      }
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'commitEditor.js')
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GitSnap Commit Editor</title>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  public dispose() {
    CommitEditorPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) x.dispose();
    }
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
```

---

### Step 5.6 — Wire Command & Panel in `src/extension/extension.ts`

#### 💡 In Simple Language:
Finally, register `gitsnap.openCommitEditor` in `extension.ts` so that clicking the command or pressing `Ctrl+Alt+G C` opens the Commit Editor panel.

#### 📝 Implementation:
In [src/extension/extension.ts](file:///c:/Users/rohit/OneDrive/Desktop/GitSnap/gitsnap/src/extension/extension.ts):

```ts
import { CommitEditorPanel } from './webview/commitEditorPanel';

const openCommitEditorCmd = vscode.commands.registerCommand(
    'gitsnap.openCommitEditor',
    async () => {
        await CommitEditorPanel.render(context.extensionUri, context);
    }
);

context.subscriptions.push(openCommitEditorCmd);
```

---

## Verification & Error Prevention Checklist

To guarantee everything compiles and executes peacefully without any runtime errors, run through this verification checklist:

### 1. Build Verification
Run the compilation script from terminal:
```bash
npm run compile
```
- **Expected Output**: Clean build of TypeScript files (`dist/extension.js`) and Vite Svelte bundles (`dist/webview/commitEditor.js`). No syntax or type errors.

### 2. Unit Test Verification
Run the test suite:
```bash
npm run test
```
- **Expected Output**: All tests pass.

### 3. Manual Functional Verification in Extension Host (`F5` in VS Code)
1. **Shortcut Check**: Press `Ctrl+Alt+G C` (or `Cmd+Alt+G C` on Mac) -> Verify that the **GitSnap Commit Editor** panel opens.
2. **Diff Preview Check**: Make a change in a file -> Open Commit Editor -> Verify staged diff appears in green (`+`) and red (`-`).
3. **Conventional Commit Tip**: Type `my commit message` -> Notice the yellow warning banner. Change it to `feat: add new shortcuts` -> Notice warning disappears.
4. **AI Toggle Check**:
   - Set `"gitsnap.ai.enabled": true` -> `💡 AI Suggest` button is visible.
   - Set `"gitsnap.ai.enabled": false` -> `💡 AI Suggest` button is completely hidden.
5. **Undo Last Commit Check**: Make a commit -> Press `Ctrl+Alt+G U` -> Verify commit is uncommitted and changes remain staged.

---

*This guide completes Phase 4 and Phase 5 execution.*
