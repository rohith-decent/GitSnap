// src/types/webviewMessages.ts

// Messages sent FROM the webview TO the extension host
export type WebviewToExtensionMessage =
  | { type: 'requestSettings' }
  | { type: 'saveApiKey'; payload: string }
  | { type: 'saveModel'; payload: string };

// Messages sent FROM the extension host TO the webview
export type ExtensionToWebviewMessage =
  | { type: 'settingsLoaded'; payload: { apiKey?: string; model?: string } };