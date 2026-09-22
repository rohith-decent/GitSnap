<script lang="ts">
  import { onMount } from 'svelte';
  import type { BranchInfo } from '../extension/git';
  import type { ExtensionToWebviewMessage } from '../types/webviewMessages';

  const vscode = acquireVsCodeApi();

  let branches: BranchInfo[] = [];
  let isLoading = true;
  let newBranchName = '';
  let showCreateInput = false;

  let confirmDeleteBranch: string | null = null;
  let isUnmergedError = false;
  let notification: { type: 'success' | 'error'; message: string } | null = null;

  onMount(() => {
    // Initial fetch of branches
    vscode.postMessage({ type: 'requestBranches' });

    const handleMessage = (event: MessageEvent<ExtensionToWebviewMessage>) => {
      const message = event.data;

      switch (message.type) {
        case 'branchesLoaded':
          branches = message.payload.branches;
          isLoading = false;
          break;

        case 'branchActionComplete':
          isLoading = false;
          if (message.payload.success) {
            notification = { type: 'success', message: message.payload.message };
            confirmDeleteBranch = null;
            isUnmergedError = false;
            // Refresh branch list after successful mutation
            vscode.postMessage({ type: 'requestBranches' });
          } else {
            notification = { type: 'error', message: message.payload.message };
            if (message.payload.message.includes('not fully merged')) {
              isUnmergedError = true;
            }
          }
          break;

        case 'error':
          isLoading = false;
          notification = { type: 'error', message: message.payload.message };
          break;
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  });

  function handleSwitch(name: string) {
    isLoading = true;
    notification = null;
    vscode.postMessage({ type: 'switchBranch', payload: { name } });
  }

  function initiateDelete(name: string) {
    confirmDeleteBranch = name;
    isUnmergedError = false;
    notification = null;
  }

  function cancelDelete() {
    confirmDeleteBranch = null;
    isUnmergedError = false;
  }

  function executeDelete(name: string, force: boolean = false) {
    isLoading = true;
    notification = null;
    vscode.postMessage({ type: 'deleteBranch', payload: { name, force } });
  }

  function handleCreateBranch() {
    const trimmed = newBranchName.trim();
    if (!trimmed) return;
    isLoading = true;
    notification = null;
    vscode.postMessage({ type: 'createBranch', payload: { name: trimmed } });
    newBranchName = '';
    showCreateInput = false;
  }

  function handleFetchAll() {
    isLoading = true;
    notification = null;
    vscode.postMessage({ type: 'fetchAll' });
  }

  function dismissNotification() {
    notification = null;
  }
</script>

<main class="dashboard">
  <header>
    <div class="title-area">
      <h2>🌿 Branch Manager</h2>
    </div>
    <div class="header-actions">
      <button class="secondary" on:click={() => (showCreateInput = !showCreateInput)}>
        {showCreateInput ? 'Cancel' : '+ New Branch'}
      </button>
      <button class="primary" on:click={handleFetchAll} disabled={isLoading}>
        🔄 Fetch All
      </button>
    </div>
  </header>

  {#if notification}
    <div class="notification-banner {notification.type}">
      <span>{notification.message}</span>
      <button class="close-btn" on:click={dismissNotification}>×</button>
    </div>
  {/if}

  {#if showCreateInput}
    <section class="create-bar">
      <input
        type="text"
        placeholder="feature/new-branch-name"
        bind:value={newBranchName}
        on:keydown={(e) => e.key === 'Enter' && handleCreateBranch()}
      />
      <button class="primary" on:click={handleCreateBranch} disabled={!newBranchName.trim()}>
        Create
      </button>
    </section>
  {/if}

  {#if isLoading}
    <div class="loading-state">
      <p>Loading branches...</p>
    </div>
  {:else if branches.length === 0}
    <div class="empty-state">
      <p>No branches found in current workspace.</p>
    </div>
  {:else}
    <ul class="branch-list">
      {#each branches as branch (branch.name)}
        <li class:current={branch.current}>
          <div class="branch-info">
            <span class="name">{branch.name}</span>
            {#if branch.current}
              <span class="badge current">● Current</span>
            {/if}
            {#if branch.isReadyToMerge}
              <span class="badge ready">✅ Ready to Merge</span>
            {/if}
            {#if branch.isDiverged}
              <span class="badge diverged">🔄 Diverged</span>
            {/if}
            {#if branch.isStale}
              <span class="badge stale">⚠️ Stale (>30d)</span>
            {/if}
            {#if branch.ahead > 0}
              <span class="badge ahead">↑ {branch.ahead}</span>
            {/if}
            {#if branch.behind > 0}
              <span class="badge behind">↓ {branch.behind}</span>
            {/if}
            {#if branch.aiInsight}
              <div class="ai-insight-pill">
                💡 {branch.aiInsight}
              </div>
            {/if}
            <div class="meta">
              Updated by {branch.lastCommitAuthor} • {branch.lastCommitDate}
            </div>
          </div>

          <div class="actions">
            {#if !branch.current}
              {#if confirmDeleteBranch === branch.name}
                <div class="confirm-inline">
                  <span class="confirm-label">Confirm Delete?</span>
                  <button class="danger" on:click={() => executeDelete(branch.name, false)}>Delete</button>
                  {#if isUnmergedError}
                    <button class="danger-force" on:click={() => executeDelete(branch.name, true)}>Force Delete</button>
                  {/if}
                  <button class="secondary" on:click={cancelDelete}>Cancel</button>
                </div>
              {:else}
                <button on:click={() => handleSwitch(branch.name)}>Checkout</button>
                <button class="danger" on:click={() => initiateDelete(branch.name)}>Delete</button>
              {/if}
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</main>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  .dashboard {
    padding: 1.25rem;
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background-color: var(--vscode-editor-background);
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.2rem;
  }

  h2 {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 600;
  }

  .header-actions {
    display: flex;
    gap: 0.5rem;
  }

  .notification-banner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.6rem 0.85rem;
    margin-bottom: 1rem;
    border-radius: 4px;
    font-size: 0.85rem;
  }

  .notification-banner.success {
    background-color: var(--vscode-inputValidation-infoBackground, rgba(0, 150, 0, 0.2));
    border: 1px solid var(--vscode-inputValidation-infoBorder, #00aa00);
    color: var(--vscode-foreground);
  }

  .notification-banner.error {
    background-color: var(--vscode-inputValidation-errorBackground, rgba(255, 0, 0, 0.2));
    border: 1px solid var(--vscode-inputValidation-errorBorder, #ff0000);
    color: var(--vscode-errorForeground, #ff5555);
  }

  .close-btn {
    background: transparent;
    border: none;
    color: inherit;
    font-size: 1.1rem;
    cursor: pointer;
    padding: 0 4px;
  }

  .create-bar {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
    padding: 0.75rem;
    background: var(--vscode-editorWidget-background);
    border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
    border-radius: 4px;
  }

  input[type='text'] {
    flex: 1;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    padding: 5px 8px;
    outline: none;
    border-radius: 2px;
    font-family: inherit;
  }

  input[type='text']:focus {
    border-color: var(--vscode-focusBorder);
  }

  .branch-list {
    list-style: none;
    padding: 0;
    margin: 0;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    overflow: hidden;
  }

  .branch-list li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.65rem 0.85rem;
    border-bottom: 1px solid var(--vscode-panel-border);
  }

  .branch-list li:last-child {
    border-bottom: none;
  }

  .branch-list li.current {
    background-color: var(--vscode-list-activeSelectionBackground);
    color: var(--vscode-list-activeSelectionForeground);
  }

  .branch-info {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
  }

  .branch-info .name {
    font-weight: 500;
  }

  .meta {
    width: 100%;
    font-size: 0.75rem;
    opacity: 0.7;
    margin-top: 0.2rem;
  }

  .badge {
    font-size: 0.75rem;
    padding: 1px 6px;
    border-radius: 3px;
    font-weight: 500;
  }

  .badge.current {
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
  }

  .badge.ready {
    background: rgba(78, 201, 176, 0.2);
    color: #4ec9b0;
    border: 1px solid rgba(78, 201, 176, 0.4);
  }

  .badge.diverged {
    background: rgba(204, 167, 0, 0.2);
    color: #cca700;
    border: 1px solid rgba(204, 167, 0, 0.4);
  }

  .badge.stale {
    background: rgba(241, 76, 76, 0.2);
    color: #f14c4c;
    border: 1px solid rgba(241, 76, 76, 0.4);
  }

  .ai-insight-pill {
    width: 100%;
    margin-top: 4px;
    font-size: 0.78rem;
    padding: 4px 8px;
    background: rgba(86, 156, 214, 0.12);
    border-left: 3px solid #569cd6;
    border-radius: 3px;
    color: var(--vscode-foreground);
  }

  .badge.ahead {
    background: var(--vscode-gitDecoration-untrackedResourceForeground);
    color: #fff;
  }

  .badge.behind {
    background: var(--vscode-gitDecoration-modifiedResourceForeground);
    color: #fff;
  }

  .actions {
    display: flex;
    gap: 0.4rem;
  }

  .confirm-inline {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .confirm-label {
    font-size: 0.8rem;
    color: var(--vscode-errorForeground);
    font-weight: 500;
  }

  button {
    padding: 4px 10px;
    font-size: 0.8rem;
    cursor: pointer;
    border-radius: 2px;
    border: 1px solid var(--vscode-button-border, transparent);
    background: var(--vscode-button-secondaryBackground, #3a3d41);
    color: var(--vscode-button-secondaryForeground, #ffffff);
    font-family: inherit;
  }

  button:hover:not(:disabled) {
    background: var(--vscode-button-secondaryHoverBackground, #45494e);
  }

  button.primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }

  button.primary:hover:not(:disabled) {
    background: var(--vscode-button-hoverBackground);
  }

  button.danger {
    color: #fff;
    background: var(--vscode-inputValidation-errorBackground, #d32f2f);
    border-color: var(--vscode-errorForeground, #d32f2f);
  }

  button.danger:hover:not(:disabled) {
    background: #b71c1c;
  }

  button.danger-force {
    color: #fff;
    background: #c62828;
    border-color: #b71c1c;
    font-weight: bold;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .loading-state,
  .empty-state {
    padding: 1.5rem 0;
    text-align: center;
    opacity: 0.7;
  }
</style>