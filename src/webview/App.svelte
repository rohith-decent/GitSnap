<!-- src/webview/App.svelte -->
<script lang="ts">
  import { vscode } from './main';
  import type { WebviewToExtensionMessage, ExtensionToWebviewMessage } from '../types/webviewMessages';

  let apiKey = $state('');
  let selectedModel = $state('groq/llama-3.1-8b-instant');
  let saved = $state(false);
  let timerId: ReturnType<typeof setTimeout> | null = null;
  
  // Derived validation: key must be at least 10 chars to be considered valid
  let isValid = $derived(apiKey.trim().length >= 10);

  // Lifecycle: request settings when component mounts, listen for responses
  $effect(() => {
    const handleMessage = (event: MessageEvent<ExtensionToWebviewMessage>) => {
      const data = event.data;
      if (data?.type === 'settingsLoaded') {
        // Only update if payload actually contains values (don't overwrite with undefined)
        if (data.payload.apiKey !== undefined) apiKey = data.payload.apiKey;
        if (data.payload.model !== undefined) selectedModel = data.payload.model;
      }
    };

    window.addEventListener('message', handleMessage);
    
    // Request current settings from extension host
    const msg: WebviewToExtensionMessage = { type: 'requestSettings' };
    vscode.postMessage(msg);

    // Cleanup listener & pending timer when component unmounts
    return () => {
      window.removeEventListener('message', handleMessage);
      if (timerId) clearTimeout(timerId);
    };
  });

  function saveSettings() {
    if (!isValid) return;

    vscode.postMessage({ type: 'saveApiKey', payload: apiKey } as WebviewToExtensionMessage);
    vscode.postMessage({ type: 'saveModel', payload: selectedModel } as WebviewToExtensionMessage);
    
    saved = true;
    if (timerId) clearTimeout(timerId);
    // Reset success indicator after 2 seconds
    timerId = setTimeout(() => (saved = false), 2000);
  }
</script>

<div class="container">
  <h2>⚡ GitSnap Settings</h2>
  
  <div class="form-group">
    <label for="apiKey">AI Provider API Key</label>
    <input 
      id="apiKey"
      type="password" 
      bind:value={apiKey} 
      placeholder="gsk_... or your provider key"
      autocomplete="off"
    />
    {#if !isValid && apiKey.trim().length > 0}
      <span class="error">Key must be at least 10 characters</span>
    {/if}
  </div>

  <div class="form-group">
    <label for="model">AI Model</label>
    <select id="model" bind:value={selectedModel}>
      <option value="groq/llama-3.1-8b-instant">Groq • Llama 3.1 8B Instant (Fast)</option>
      <option value="groq/llama-3.1-70b-versatile">Groq • Llama 3.1 70B Versatile</option>
      <option value="groq/mixtral-8x7b-32768">Groq • Mixtral 8x7B (Large Context)</option>
      <option value="openai/gpt-oss-20b">OpenAI Compatible • GPT-OSS 20B</option>
    </select>
  </div>

  <button type="button" disabled={!isValid} onclick={saveSettings}>
    {saved ? '✅ Saved!' : 'Save Settings'}
  </button>
</div>

<style>
  :global(body) {
    font-family: var(--vscode-font-family, sans-serif);
    color: var(--vscode-foreground, #cccccc);
    background-color: var(--vscode-editor-background, #1e1e1e);
    margin: 0;
    padding: 20px;
  }
  .container { max-width: 500px; margin: 0 auto; }
  h2 { margin-top: 0; color: var(--vscode-textLink-foreground, #3794ff); }
  .form-group { margin-bottom: 16px; }
  label { display: block; margin-bottom: 6px; font-weight: 500; }
  input, select {
    width: 100%;
    padding: 8px;
    background: var(--vscode-input-background, #3c3c3c);
    color: var(--vscode-input-foreground, #cccccc);
    border: 1px solid var(--vscode-input-border, #555555);
    border-radius: 4px;
    box-sizing: border-box;
  }
  input:focus, select:focus { outline: 1px solid var(--vscode-focusBorder, #007fd4); }
  button {
    width: 100%;
    padding: 10px;
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #ffffff);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
  }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  button:hover:not(:disabled) { background: var(--vscode-button-hoverBackground, #1177bb); }
  .error { color: var(--vscode-errorForeground, #f44747); font-size: 0.85em; margin-top: 4px; display: block; }
</style>