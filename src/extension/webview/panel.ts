import * as vscode from 'vscode';
import { WebviewToExtensionMessage, ExtensionToWebviewMessage } from '../../types/webviewMessages';
import * as secrets from '../secrets';

// Generate a random nonce for CSP compliance
function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export function createSettingsPanel(context: vscode.ExtensionContext): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel(
    'gitsnap.settings',
    'GitSnap Settings',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview'),
      ],
    }
  );

  const nonce = getNonce();

  // Point to Vite's compiled output
  const scriptUri = panel.webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview', 'assets', 'main.js')
  );
  const styleUri = panel.webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview', 'assets', 'main.css')
  );

  panel.webview.html = getWebviewContent(panel.webview, scriptUri, styleUri, nonce);

  // ── Handle messages FROM the webview ──
  const messageListener = panel.webview.onDidReceiveMessage(async (message: WebviewToExtensionMessage) => {
    try {
      switch (message.type) {
        case 'requestSettings': {
          const apiKey = await secrets.getApiKey(context);
          const model = await secrets.getModel(context);
          const response: ExtensionToWebviewMessage = {
            type: 'settingsLoaded',
            payload: { apiKey, model },
          };
          await panel.webview.postMessage(response);
          break;
        }

        case 'saveApiKey': {
          await secrets.storeApiKey(context, message.payload);
          vscode.window.showInformationMessage('✅ API key saved securely');
          break;
        }

        case 'saveModel': {
          await secrets.storeModel(context, message.payload);
          vscode.window.showInformationMessage('✅ Model preference saved');
          break;
        }
      }
    } catch (err) {
      vscode.window.showErrorMessage(`GitSnap Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  context.subscriptions.push(messageListener);
  panel.onDidDispose(() => messageListener.dispose(), null, context.subscriptions);

  return panel;
}

function getWebviewContent(webview: vscode.Webview, scriptUri: vscode.Uri, styleUri: vscode.Uri, nonce: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${webview.cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
  <title>GitSnap Settings</title>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}