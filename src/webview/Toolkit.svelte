<script lang="ts">
  import { onMount } from 'svelte';
  import type { ExtensionToWebviewMessage } from '../types/webviewMessages';
  import type { LogCommitInfo, StashInfo, WorktreeInfo, RebaseCommitInfo } from '../extension/git';

  const vscode = acquireVsCodeApi();

  let activeTab: 'log' | 'stash' | 'cherry' | 'rebase' | 'worktree' = 'log';
  let isLoading = false;
  let notification: { type: 'success' | 'error'; message: string } | null = null;

  // Log Explorer State
  let logAuthor = '';
  let logGrep = '';
  let logBranch = '';
  let logCommits: LogCommitInfo[] = [];

  // Stash Manager State
  let stashes: StashInfo[] = [];
  let newStashMsg = '';
  let selectedStashRef: string | null = null;
  let stashDiff: string | null = null;
  let stashSummaries: Record<string, string> = {};

  // Cherry Pick State
  let cherryCommits: LogCommitInfo[] = [];
  let selectedCherrySha = '';

  // Rebase Preview State
  let rebaseBaseBranch = 'main';
  let rebaseCommits: RebaseCommitInfo[] = [];
  let rebaseLoaded = false;

  // Worktree State
  let worktrees: WorktreeInfo[] = [];
  let newWorktreePath = '';
  let newWorktreeBranch = '';

  onMount(() => {
    // Initial fetch for log explorer and stashes
    fetchLog();
    fetchStashes();
    fetchWorktrees();

    const handleMessage = (event: MessageEvent<ExtensionToWebviewMessage>) => {
      const msg = event.data;
      switch (msg.type) {
        case 'logExplorerLoaded':
          logCommits = msg.payload.commits;
          cherryCommits = msg.payload.commits;
          isLoading = false;
          break;

        case 'stashesLoaded':
          stashes = msg.payload.stashes;
          isLoading = false;
          break;

        case 'stashDiffLoaded':
          if (selectedStashRef === msg.payload.ref) {
            stashDiff = msg.payload.diff;
          }
          break;

        case 'stashAiSummaryLoaded':
          stashSummaries[msg.payload.ref] = msg.payload.summary;
          stashSummaries = { ...stashSummaries };
          break;

        case 'rebasePreviewLoaded':
          rebaseCommits = msg.payload.commits;
          rebaseLoaded = true;
          isLoading = false;
          break;

        case 'worktreesLoaded':
          worktrees = msg.payload.worktrees;
          isLoading = false;
          break;

        case 'toolkitActionComplete':
          isLoading = false;
          if (msg.payload.success) {
            notification = { type: 'success', message: msg.payload.message };
          } else {
            notification = { type: 'error', message: msg.payload.message };
          }
          break;

        case 'error':
          isLoading = false;
          notification = { type: 'error', message: msg.payload.message };
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  });

  function fetchLog() {
    isLoading = true;
    vscode.postMessage({
      type: 'requestLogExplorer',
      payload: { author: logAuthor, grep: logGrep, branch: logBranch },
    });
  }

  function fetchStashes() {
    vscode.postMessage({ type: 'requestStashes' });
  }

  function fetchWorktrees() {
    vscode.postMessage({ type: 'requestWorktrees' });
  }

  function handleCreateStash() {
    isLoading = true;
    notification = null;
    vscode.postMessage({ type: 'createStash', payload: { message: newStashMsg } });
    newStashMsg = '';
  }

  function handleStashAction(action: 'apply' | 'pop' | 'drop', ref: string) {
    isLoading = true;
    notification = null;
    if (action === 'apply') vscode.postMessage({ type: 'applyStash', payload: { ref } });
    if (action === 'pop') vscode.postMessage({ type: 'popStash', payload: { ref } });
    if (action === 'drop') vscode.postMessage({ type: 'dropStash', payload: { ref } });
  }

  function viewStashDiff(ref: string) {
    selectedStashRef = ref;
    stashDiff = 'Loading diff...';
    vscode.postMessage({ type: 'requestStashDiff', payload: { ref } });
  }

  function requestStashSummary(ref: string) {
    stashSummaries[ref] = 'Generating AI summary...';
    stashSummaries = { ...stashSummaries };
    vscode.postMessage({ type: 'requestStashAiSummary', payload: { ref } });
  }

  function handleCherryPick() {
    if (!selectedCherrySha) return;
    isLoading = true;
    notification = null;
    vscode.postMessage({ type: 'cherryPickCommit', payload: { sha: selectedCherrySha } });
  }

  function fetchRebasePreview() {
    if (!rebaseBaseBranch.trim()) return;
    isLoading = true;
    notification = null;
    vscode.postMessage({ type: 'requestRebasePreview', payload: { baseBranch: rebaseBaseBranch.trim() } });
  }

  function handleCreateWorktree() {
    if (!newWorktreePath.trim() || !newWorktreeBranch.trim()) return;
    isLoading = true;
    notification = null;
    vscode.postMessage({
      type: 'createWorktree',
      payload: { path: newWorktreePath.trim(), branch: newWorktreeBranch.trim() },
    });
    newWorktreePath = '';
    newWorktreeBranch = '';
  }
</script>

<main class="toolkit-container">
  <header>
    <h2>🧰 GitSnap Advanced Toolkit</h2>
    <nav class="tabs">
      <button class:active={activeTab === 'log'} on:click={() => (activeTab = 'log')}>📜 Log Explorer</button>
      <button class:active={activeTab === 'stash'} on:click={() => (activeTab = 'stash')}>📦 Stash Manager</button>
      <button class:active={activeTab === 'cherry'} on:click={() => (activeTab = 'cherry')}>🍒 Cherry-Pick</button>
      <button class:active={activeTab === 'rebase'} on:click={() => (activeTab = 'rebase')}>🔄 Rebase Preview</button>
      <button class:active={activeTab === 'worktree'} on:click={() => (activeTab = 'worktree')}>🌳 Worktrees</button>
    </nav>
  </header>

  {#if notification}
    <div class="banner {notification.type}">
      <span>{notification.message}</span>
      <button class="close-btn" on:click={() => (notification = null)}>×</button>
    </div>
  {/if}

  <!-- TAB 1: LOG EXPLORER -->
  {#if activeTab === 'log'}
    <section class="tab-content">
      <div class="filter-bar">
        <input type="text" placeholder="Author filter" bind:value={logAuthor} />
        <input type="text" placeholder="Message search (grep)" bind:value={logGrep} />
        <input type="text" placeholder="Branch (optional)" bind:value={logBranch} />
        <button class="primary" on:click={fetchLog} disabled={isLoading}>Search</button>
      </div>

      {#if logCommits.length === 0}
        <p class="empty-state">No commits found matching filters.</p>
      {:else}
        <ul class="commit-list">
          {#each logCommits as c (c.hash)}
            <li class="commit-item">
              <div class="commit-header">
                <span class="sha">{c.hash.slice(0, 7)}</span>
                <span class="msg">{c.message}</span>
                {#if c.refs}
                  <span class="refs">{c.refs}</span>
                {/if}
              </div>
              <div class="commit-meta">
                {c.author_name} ({c.author_email}) • {c.date}
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}

  <!-- TAB 2: STASH MANAGER -->
  {#if activeTab === 'stash'}
    <section class="tab-content">
      <div class="create-bar">
        <input type="text" placeholder="Stash description message (optional)" bind:value={newStashMsg} />
        <button class="primary" on:click={handleCreateStash} disabled={isLoading}>+ Create Stash</button>
      </div>

      {#if stashes.length === 0}
        <p class="empty-state">No stashes found in this repository.</p>
      {:else}
        <ul class="stash-list">
          {#each stashes as s (s.name)}
            <li class="stash-item">
              <div class="stash-info">
                <strong>{s.name}</strong> — <span class="msg">{s.message}</span>
                <span class="meta">({s.date})</span>

                {#if stashSummaries[s.name]}
                  <div class="ai-summary-pill">💡 {stashSummaries[s.name]}</div>
                {/if}
              </div>

              <div class="stash-actions">
                <button on:click={() => requestStashSummary(s.name)}>AI Summary</button>
                <button on:click={() => viewStashDiff(s.name)}>View Diff</button>
                <button on:click={() => handleStashAction('apply', s.name)}>Apply</button>
                <button on:click={() => handleStashAction('pop', s.name)}>Pop</button>
                <button class="danger" on:click={() => handleStashAction('drop', s.name)}>Drop</button>
              </div>
            </li>
          {/each}
        </ul>
      {/if}

      {#if selectedStashRef && stashDiff}
        <div class="stash-diff-box">
          <div class="diff-header">
            <h4>Diff for {selectedStashRef}</h4>
            <button class="close-btn" on:click={() => (selectedStashRef = null)}>×</button>
          </div>
          <pre>{stashDiff}</pre>
        </div>
      {/if}
    </section>
  {/if}

  <!-- TAB 3: CHERRY-PICK SELECTOR -->
  {#if activeTab === 'cherry'}
    <section class="tab-content">
      <p class="section-desc">Select a commit from history to cherry-pick into the current branch.</p>

      <div class="cherry-picker">
        <select bind:value={selectedCherrySha}>
          <option value="">-- Select Commit --</option>
          {#each cherryCommits as c (c.hash)}
            <option value={c.hash}>{c.hash.slice(0, 7)} - {c.message} ({c.author_name})</option>
          {/each}
        </select>
        <button class="primary" on:click={handleCherryPick} disabled={!selectedCherrySha || isLoading}>
          🍒 Cherry-Pick
        </button>
      </div>
    </section>
  {/if}

  <!-- TAB 4: REBASE PREVIEW -->
  {#if activeTab === 'rebase'}
    <section class="tab-content">
      <div class="info-alert">
        ℹ️ <strong>Rebase Preview is read-only by design.</strong> It shows the exact sequence of commits that would be replayed when rebasing your current branch onto the target base.
      </div>

      <div class="rebase-controls">
        <label for="baseBranchInput">Target Base Branch:</label>
        <input id="baseBranchInput" type="text" placeholder="main" bind:value={rebaseBaseBranch} />
        <button class="primary" on:click={fetchRebasePreview} disabled={isLoading}>
          Preview Rebase
        </button>
      </div>

      {#if rebaseLoaded}
        {#if rebaseCommits.length === 0}
          <p class="empty-state">No commits to replay. Current branch is already up to date with '{rebaseBaseBranch}'.</p>
        {:else}
          <div class="preview-box">
            <h4>Commits to be replayed onto {rebaseBaseBranch} ({rebaseCommits.length}):</h4>
            <ol class="rebase-list">
              {#each rebaseCommits as c (c.hash)}
                <li>
                  <span class="sha">{c.hash}</span> <span class="msg">{c.message}</span>
                </li>
              {/each}
            </ol>
          </div>
        {/if}
      {/if}
    </section>
  {/if}

  <!-- TAB 5: WORKTREES -->
  {#if activeTab === 'worktree'}
    <section class="tab-content">
      <div class="create-bar">
        <input type="text" placeholder="Relative Path (e.g. ../my-feature-wt)" bind:value={newWorktreePath} />
        <input type="text" placeholder="Branch Name (e.g. feature/wt-branch)" bind:value={newWorktreeBranch} />
        <button class="primary" on:click={handleCreateWorktree} disabled={isLoading}>+ Add Worktree</button>
      </div>

      {#if worktrees.length === 0}
        <p class="empty-state">No worktrees registered.</p>
      {:else}
        <ul class="worktree-list">
          {#each worktrees as w (w.path)}
            <li class="worktree-item">
              <div class="wt-info">
                <strong>{w.path}</strong>
                {#if w.isBare}<span class="badge bare">bare</span>{/if}
              </div>
              <div class="wt-meta">
                Branch: <code>{w.branch || 'detached'}</code> • HEAD: <code>{w.commit.slice(0, 7)}</code>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
</main>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  .toolkit-container {
    padding: 1.25rem;
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background-color: var(--vscode-editor-background);
  }

  header {
    margin-bottom: 1rem;
  }

  h2 {
    margin: 0 0 0.8rem 0;
    font-size: 1.2rem;
    font-weight: 600;
  }

  .tabs {
    display: flex;
    gap: 0.4rem;
    border-bottom: 1px solid var(--vscode-panel-border);
    padding-bottom: 0.5rem;
  }

  .tabs button {
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--vscode-foreground);
    padding: 6px 12px;
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 500;
  }

  .tabs button.active {
    border-bottom-color: var(--vscode-button-background);
    color: var(--vscode-button-background);
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

  .tab-content {
    margin-top: 1rem;
  }

  .filter-bar,
  .create-bar,
  .rebase-controls,
  .cherry-picker {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
    flex-wrap: wrap;
    align-items: center;
  }

  input[type='text'],
  select {
    flex: 1;
    min-width: 150px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    padding: 6px 10px;
    border-radius: 3px;
    outline: none;
    font-family: inherit;
  }

  button {
    padding: 6px 12px;
    font-size: 0.82rem;
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

  button.danger {
    background: var(--vscode-inputValidation-errorBackground, #d32f2f);
    color: #fff;
  }

  .commit-list,
  .stash-list,
  .worktree-list {
    list-style: none;
    padding: 0;
    margin: 0;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
  }

  .commit-item,
  .stash-item,
  .worktree-item {
    padding: 0.65rem 0.85rem;
    border-bottom: 1px solid var(--vscode-panel-border);
  }

  .commit-item:last-child,
  .stash-item:last-child,
  .worktree-item:last-child {
    border-bottom: none;
  }

  .sha {
    font-family: monospace;
    color: var(--vscode-textPreformat-foreground, #569cd6);
    font-weight: bold;
    margin-right: 6px;
  }

  .refs {
    font-size: 0.75rem;
    background: rgba(86, 156, 214, 0.2);
    color: #569cd6;
    padding: 1px 5px;
    border-radius: 3px;
    margin-left: 6px;
  }

  .commit-meta,
  .meta,
  .wt-meta {
    font-size: 0.78rem;
    opacity: 0.75;
    margin-top: 4px;
  }

  .ai-summary-pill {
    margin-top: 4px;
    font-size: 0.8rem;
    padding: 4px 8px;
    background: rgba(86, 156, 214, 0.12);
    border-left: 3px solid #569cd6;
    border-radius: 3px;
  }

  .stash-actions {
    display: flex;
    gap: 0.4rem;
    margin-top: 8px;
  }

  .stash-diff-box {
    margin-top: 1rem;
    padding: 0.8rem;
    background: var(--vscode-editorWidget-background);
    border: 1px solid var(--vscode-widget-border);
    border-radius: 4px;
  }

  .stash-diff-box pre {
    max-height: 250px;
    overflow: auto;
    font-family: monospace;
    font-size: 0.8rem;
    white-space: pre-wrap;
  }

  .info-alert {
    padding: 0.75rem;
    margin-bottom: 1rem;
    background: var(--vscode-inputValidation-infoBackground, rgba(0, 122, 204, 0.15));
    border: 1px solid var(--vscode-inputValidation-infoBorder, #007acc);
    border-radius: 4px;
    font-size: 0.85rem;
  }

  .preview-box {
    margin-top: 1rem;
    padding: 0.8rem;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    background: var(--vscode-editorWidget-background);
  }

  .rebase-list {
    margin: 0;
    padding-left: 1.2rem;
  }

  .rebase-list li {
    margin-bottom: 6px;
    font-size: 0.85rem;
  }

  .badge.bare {
    font-size: 0.72rem;
    background: rgba(200, 200, 200, 0.2);
    padding: 1px 5px;
    border-radius: 3px;
    margin-left: 6px;
  }

  .empty-state {
    text-align: center;
    opacity: 0.7;
    padding: 1.5rem 0;
  }

  .section-desc {
    font-size: 0.88rem;
    opacity: 0.8;
    margin-bottom: 1rem;
  }
</style>
