<script lang="ts">
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
  let isConventional = $derived(
    commitMessage.trim().length === 0 || conventionalCommitRegex.test(commitMessage.trim())
  );

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
          diff = msg.payload.diff;
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
          class="btn-primary"
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

  .diff-section,
  .message-section {
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

  .empty-diff {
    color: var(--vscode-descriptionForeground);
    font-style: italic;
    padding: 8px;
  }

  .diff-add {
    color: #4ec9b0;
    background: rgba(78, 201, 176, 0.1);
  }

  .diff-remove {
    color: #f14c4c;
    background: rgba(241, 76, 76, 0.1);
  }

  .diff-header {
    color: #569cd6;
    font-weight: bold;
  }

  .diff-normal {
    color: var(--vscode-editor-foreground);
  }

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
