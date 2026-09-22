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
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'commitEditor.css')
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
  <title>GitSnap Commit Editor</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
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
