import * as vscode from 'vscode';
import * as git from '../git';
import * as ai from '../ai';
import * as secrets from '../secrets';
import type { WebviewToExtensionMessage, ExtensionToWebviewMessage } from '../../types/webviewMessages';

export class PrPrepPanel {
  public static currentPanel: PrPrepPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _context: vscode.ExtensionContext;
  private _disposables: vscode.Disposable[] = [];

  public static async render(extensionUri: vscode.Uri, context: vscode.ExtensionContext): Promise<void> {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (PrPrepPanel.currentPanel) {
      PrPrepPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'gitsnapPrPrep',
      'GitSnap PR Prep Assistant',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'webview')],
      }
    );

    PrPrepPanel.currentPanel = new PrPrepPanel(panel, extensionUri, context);
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
    try {
      switch (message.type) {
        case 'requestPrPrepData': {
          const branches = await git.listBranches();
          const currentBranch = branches.find((b) => b.current)?.name || 'main';
          // Default base branch: main or master or first non-current branch
          const defaultBase = message.payload?.baseBranch ||
            (branches.find((b) => b.name === 'main' || b.name === 'master')?.name) ||
            branches.find((b) => !b.current)?.name ||
            'main';

          let commits: git.LogCommitInfo[] = [];
          try {
            commits = await git.getCommitsBetween(defaultBase, currentBranch);
          } catch {
            commits = [];
          }

          this.postMessage({
            type: 'prPrepDataLoaded',
            payload: {
              branches,
              currentBranch,
              commits,
            },
          });
          break;
        }

        case 'generatePrDescription': {
          const baseBranch = message.payload.baseBranch;
          const branches = await git.listBranches();
          const currentBranch = branches.find((b) => b.current)?.name || 'HEAD';
          const commits = await git.getCommitsBetween(baseBranch, currentBranch);
          const commitSubjects = commits.map((c) => c.message);

          const apiKey = await secrets.getApiKey(this._context);
          const model = await secrets.getModel(this._context);

          const { title, body } = await ai.generatePrDescription(commitSubjects, apiKey || '', model);
          this.postMessage({
            type: 'prDescriptionGenerated',
            payload: { title, body },
          });
          break;
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.postMessage({
        type: 'error',
        payload: { message: msg },
      });
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'prPrep.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'prPrep.css')
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
  <title>GitSnap PR Prep Assistant</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  public dispose() {
    PrPrepPanel.currentPanel = undefined;
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
