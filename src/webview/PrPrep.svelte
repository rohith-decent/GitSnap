<script lang="ts">
  import { onMount } from 'svelte';
  import type { ExtensionToWebviewMessage } from '../types/webviewMessages';
  import type { BranchInfo, LogCommitInfo } from '../extension/git';

  const vscode = acquireVsCodeApi();

  let branches: BranchInfo[] = [];
  let currentBranch = 'HEAD';
  let targetBaseBranch = 'main';
  let commits: LogCommitInfo[] = [];
  let isLoading = false;
  let isGenerating = false;
  let notification: { type: 'success' | 'error'; message: string } | null = null;

  let prTitle = '';
  let prBody = '';
  let titleCopied = false;
  let bodyCopied = false;

  onMount(() => {
    isLoading = true;
    vscode.postMessage({ type: 'requestPrPrepData' });

    const handleMessage = (event: MessageEvent<ExtensionToWebviewMessage>) => {
      const msg = event.data;
      switch (msg.type) {
        case 'prPrepDataLoaded':
          branches = msg.payload.branches;
          currentBranch = msg.payload.currentBranch;
          commits = msg.payload.commits;
          isLoading = false;
          break;

        case 'prDescriptionGenerated':
          isGenerating = false;
          prTitle = msg.payload.title;
          prBody = msg.payload.body;
          notification = { type: 'success', message: '✅ Draft PR description generated with AI!' };
          break;

        case 'error':
          isLoading = false;
          isGenerating = false;
          notification = { type: 'error', message: msg.payload.message };
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  });

  function handleBaseChange() {
    isLoading = true;
    vscode.postMessage({
      type: 'requestPrPrepData',
      payload: { baseBranch: targetBaseBranch },
    });
  }

  function generatePrDescription() {
    isGenerating = true;
    notification = null;
    vscode.postMessage({
      type: 'generatePrDescription',
      payload: { baseBranch: targetBaseBranch },
    });
  }

  function copyTitle() {
    navigator.clipboard.writeText(prTitle);
    titleCopied = true;
    setTimeout(() => (titleCopied = false), 2000);
  }

  function copyBody() {
    navigator.clipboard.writeText(prBody);
    bodyCopied = true;
    setTimeout(() => (bodyCopied = false), 2000);
  }
</script>

<main class="pr-prep-container">
  <header>
    <h2>🔀 GitSnap PR Prep Assistant</h2>
    <p class="subtitle">
      Generate draft PR title and markdown description from branch commits. 
      <em>Manual review required — GitSnap does not auto-submit PRs externally.</em>
    </p>
  </header>

  {#if notification}
    <div class="banner {notification.type}">
      <span>{notification.message}</span>
      <button class="close-btn" on:click={() => (notification = null)}>×</button>
    </div>
  {/if}

  <section class="config-card">
    <div class="branch-selector">
      <div class="field">
        <label for="currentBranchSelect">Current Head Branch:</label>
        <input id="currentBranchSelect" type="text" value={currentBranch} disabled />
      </div>

      <div class="field">
        <label for="targetBaseBranchSelect">Target Base Branch:</label>
        <select id="targetBaseBranchSelect" bind:value={targetBaseBranch} on:change={handleBaseChange}>
          {#each branches as b (b.name)}
            {#if !b.current}
              <option value={b.name}>{b.name}</option>
            {/if}
          {/each}
          {#if branches.length === 0}
            <option value="main">main</option>
          {/if}
        </select>
      </div>
    </div>

    <div class="commits-preview">
      <h4>Commits in PR ({commits.length}):</h4>
      {#if isLoading}
        <p class="empty">Loading commit history...</p>
      {:else if commits.length === 0}
        <p class="empty">No commits detected between {currentBranch} and {targetBaseBranch}.</p>
      {:else}
        <ul class="commit-list">
          {#each commits as c (c.hash)}
            <li>
              <code>{c.hash.slice(0, 7)}</code> {c.message} <span class="author">({c.author_name})</span>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <button
      class="primary generate-btn"
      on:click={generatePrDescription}
      disabled={isGenerating || commits.length === 0}
    >
      {isGenerating ? '✨ Generating PR Description...' : '✨ Generate PR Description with AI'}
    </button>
  </section>

  {#if prTitle || prBody}
    <section class="editor-card">
      <div class="field-header">
        <h3>Draft PR Title</h3>
        <button class="secondary" on:click={copyTitle}>
          {titleCopied ? '✓ Copied!' : '📋 Copy Title'}
        </button>
      </div>
      <input type="text" bind:value={prTitle} class="title-input" />

      <div class="field-header">
        <h3>Draft PR Description Body (Markdown)</h3>
        <button class="secondary" on:click={copyBody}>
          {bodyCopied ? '✓ Copied!' : '📋 Copy Markdown Body'}
        </button>
      </div>
      <textarea bind:value={prBody} rows="14" class="body-textarea"></textarea>
    </section>
  {/if}
</main>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  .pr-prep-container {
    padding: 1.25rem;
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background-color: var(--vscode-editor-background);
  }

  header h2 {
    margin: 0 0 4px 0;
    font-size: 1.2rem;
    font-weight: 600;
  }

  .subtitle {
    font-size: 0.82rem;
    opacity: 0.8;
    margin: 0 0 1.2rem 0;
  }

  .banner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.6rem 0.85rem;
    margin-bottom: 1rem;
    border-radius: 4px;
    font-size: 0.85rem;
  }

  .banner.success {
    background-color: var(--vscode-inputValidation-infoBackground, rgba(0, 150, 0, 0.2));
    border: 1px solid var(--vscode-inputValidation-infoBorder, #00aa00);
  }

  .banner.error {
    background-color: var(--vscode-inputValidation-errorBackground, rgba(255, 0, 0, 0.2));
    border: 1px solid var(--vscode-inputValidation-errorBorder, #ff0000);
  }

  .close-btn {
    background: transparent;
    border: none;
    color: inherit;
    font-size: 1.1rem;
    cursor: pointer;
  }

  .config-card,
  .editor-card {
    padding: 1rem;
    background: var(--vscode-editorWidget-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    margin-bottom: 1.2rem;
  }

  .branch-selector {
    display: flex;
    gap: 1rem;
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }

  .field {
    flex: 1;
    min-width: 200px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  label {
    font-size: 0.82rem;
    font-weight: 500;
  }

  input[type='text'],
  select,
  textarea {
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    padding: 6px 10px;
    border-radius: 3px;
    outline: none;
    font-family: inherit;
  }

  input:disabled {
    opacity: 0.7;
  }

  .commits-preview {
    margin-bottom: 1rem;
  }

  .commits-preview h4 {
    margin: 0 0 6px 0;
    font-size: 0.9rem;
  }

  .commit-list {
    margin: 0;
    padding-left: 1.2rem;
    max-height: 150px;
    overflow-y: auto;
  }

  .commit-list li {
    font-size: 0.82rem;
    margin-bottom: 4px;
  }

  .commit-list code {
    color: #569cd6;
    font-family: monospace;
  }

  .author {
    opacity: 0.7;
    font-size: 0.78rem;
  }

  .empty {
    font-size: 0.82rem;
    opacity: 0.7;
    margin: 0;
  }

  .generate-btn {
    width: 100%;
    padding: 8px 16px;
    font-size: 0.9rem;
    font-weight: 600;
  }

  button {
    cursor: pointer;
    border-radius: 2px;
    border: 1px solid var(--vscode-button-border, transparent);
    background: var(--vscode-button-secondaryBackground, #3a3d41);
    color: var(--vscode-button-secondaryForeground, #ffffff);
    font-family: inherit;
  }

  button.primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .field-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: 0.8rem 0 0.4rem 0;
  }

  .field-header:first-child {
    margin-top: 0;
  }

  .field-header h3 {
    margin: 0;
    font-size: 0.95rem;
  }

  .title-input {
    width: 100%;
    box-sizing: border-box;
    font-size: 0.95rem;
    font-weight: bold;
  }

  .body-textarea {
    width: 100%;
    box-sizing: border-box;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 0.85rem;
    line-height: 1.4;
    resize: vertical;
  }
</style>
