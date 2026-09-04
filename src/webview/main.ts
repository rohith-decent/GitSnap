// src/webview/main.ts
import { mount } from 'svelte';
import App from './App.svelte';

export interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

// Safely acquire VS Code API singleton
function getVsCodeApi(): VsCodeApi {
  const globalState = globalThis as unknown as { _vscodeApi?: VsCodeApi };
  if (!globalState._vscodeApi) {
    if (typeof acquireVsCodeApi === 'function') {
      globalState._vscodeApi = acquireVsCodeApi();
    } else {
      globalState._vscodeApi = {
        postMessage: (msg: unknown) => console.log('postMessage:', msg),
        getState: () => ({}),
        setState: () => {},
      };
    }
  }
  return globalState._vscodeApi;
}

export const vscode = getVsCodeApi();

// Mount the Svelte 5 component
const target = document.getElementById('app');
if (target) {
  mount(App, { target });
}