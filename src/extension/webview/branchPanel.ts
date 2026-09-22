import * as vscode from 'vscode';
import * as path from 'path';
import * as git from '../git';
import * as ai from '../ai';
import * as secrets from '../secrets';
import { isAiEnabled } from '../ai/config';
import { WebviewToExtensionMessage } from '../../types/webviewMessages';

export class BranchDashboardPanel {
  public static currentPanel: BranchDashboardPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _context?: vscode.ExtensionContext;
  private _disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, context?: vscode.ExtensionContext) {
    this._panel = panel;
    this._context = context;
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.html = this._getWebviewContent(this._panel.webview, extensionUri);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      async (message: any) => {
        try {
          switch (message.type) {
            case 'requestBranches': {
              const branches = await git.listBranches();

              // If AI is enabled and context is present, generate branch insights asynchronously
              if (isAiEnabled() && this._context) {
                try {
                  const apiKey = await secrets.getApiKey(this._context);
                  const model = await secrets.getModel(this._context);

                  // Fetch insights for current branch or top branches
                  for (const b of branches) {
                    if (b.current || b.isDiverged || b.isStale || b.isReadyToMerge) {
                      b.aiInsight = await ai.generateBranchInsight(b, apiKey || '', model);
                    }
                  }
                } catch {
                  // Fall back gracefully to raw metadata if AI call fails
                }
              }

              this._panel.webview.postMessage({
                type: 'branchesLoaded',
                payload: { branches }
              });
              break;
            }

            case 'switchBranch':
              await git.switchBranch(message.payload.name);
              this._panel.webview.postMessage({
                type: 'branchActionComplete',
                payload: { success: true, message: `Switched to ${message.payload.name}` }
              });
              break;

            case 'createBranch':
              await git.createBranch(message.payload.name, message.payload.from);
              this._panel.webview.postMessage({
                type: 'branchActionComplete',
                payload: { success: true, message: `Created branch ${message.payload.name}` }
              });
              break;

            case 'deleteBranch':
              await git.deleteBranch(message.payload.name, message.payload.force);
              this._panel.webview.postMessage({
                type: 'branchActionComplete',
                payload: { success: true, message: `Deleted ${message.payload.name}` }
              });
              break;

            case 'fetchAll':
              await git.fetchAll();
              this._panel.webview.postMessage({
                type: 'branchActionComplete',
                payload: { success: true, message: 'Fetched all branches' }
              });
              break;
          }
        } catch (error: any) {
          // Send error back to the webview so it can show an alert
          this._panel.webview.postMessage({
            type: 'branchActionComplete',
            payload: { success: false, message: error.message || 'Unknown error' }
          });
        }
      },
      null,
      this._disposables
    );
  }

  public static render(extensionUri: vscode.Uri, context?: vscode.ExtensionContext) {
    if (BranchDashboardPanel.currentPanel) {
      BranchDashboardPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'gitsnapBranchDashboard',
      'GitSnap Branch Dashboard',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'webview')]
      }
    );

    BranchDashboardPanel.currentPanel = new BranchDashboardPanel(panel, extensionUri, context);
  }

  public dispose() {
    BranchDashboardPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'dashboard.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'dashboard.css'));

    const nonce = getNonce();

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="${styleUri}" rel="stylesheet">
        <title>GitSnap Branch Dashboard</title>
      </head>
      <body>
        <div id="app"></div>
        <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>`;
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}