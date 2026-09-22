import * as vscode from 'vscode';
import * as git from '../git';
import * as ai from '../ai';
import * as secrets from '../secrets';
import type { WebviewToExtensionMessage, ExtensionToWebviewMessage } from '../../types/webviewMessages';

export class ToolkitPanel {
  public static currentPanel: ToolkitPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _context: vscode.ExtensionContext;
  private _disposables: vscode.Disposable[] = [];

  public static async render(extensionUri: vscode.Uri, context: vscode.ExtensionContext): Promise<void> {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (ToolkitPanel.currentPanel) {
      ToolkitPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'gitsnapToolkit',
      'GitSnap Advanced Toolkit',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'webview')],
      }
    );

    ToolkitPanel.currentPanel = new ToolkitPanel(panel, extensionUri, context);
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
        case 'requestLogExplorer': {
          const commits = await git.getLogExplorer(message.payload);
          this.postMessage({
            type: 'logExplorerLoaded',
            payload: { commits },
          });
          break;
        }

        case 'requestStashes': {
          const stashes = await git.listStashes();
          this.postMessage({
            type: 'stashesLoaded',
            payload: { stashes },
          });
          break;
        }

        case 'createStash': {
          await git.createStash(message.payload.message);
          const stashes = await git.listStashes();
          this.postMessage({
            type: 'toolkitActionComplete',
            payload: { success: true, message: 'Stash created successfully.' },
          });
          this.postMessage({ type: 'stashesLoaded', payload: { stashes } });
          break;
        }

        case 'applyStash': {
          await git.applyStash(message.payload.ref);
          this.postMessage({
            type: 'toolkitActionComplete',
            payload: { success: true, message: `Applied ${message.payload.ref}` },
          });
          break;
        }

        case 'dropStash': {
          await git.dropStash(message.payload.ref);
          const stashes = await git.listStashes();
          this.postMessage({
            type: 'toolkitActionComplete',
            payload: { success: true, message: `Dropped ${message.payload.ref}` },
          });
          this.postMessage({ type: 'stashesLoaded', payload: { stashes } });
          break;
        }

        case 'popStash': {
          await git.popStash(message.payload.ref);
          const stashes = await git.listStashes();
          this.postMessage({
            type: 'toolkitActionComplete',
            payload: { success: true, message: `Popped ${message.payload.ref}` },
          });
          this.postMessage({ type: 'stashesLoaded', payload: { stashes } });
          break;
        }

        case 'requestStashDiff': {
          const diff = await git.getStashDiff(message.payload.ref);
          this.postMessage({
            type: 'stashDiffLoaded',
            payload: { ref: message.payload.ref, diff },
          });
          break;
        }

        case 'requestStashAiSummary': {
          const diff = await git.getStashDiff(message.payload.ref);
          const apiKey = await secrets.getApiKey(this._context);
          const model = await secrets.getModel(this._context);
          const summary = await ai.generateStashSummary(diff, apiKey || '', model);
          this.postMessage({
            type: 'stashAiSummaryLoaded',
            payload: {
              ref: message.payload.ref,
              summary: summary || 'No summary available.',
            },
          });
          break;
        }

        case 'cherryPickCommit': {
          await git.cherryPick(message.payload.sha);
          this.postMessage({
            type: 'toolkitActionComplete',
            payload: {
              success: true,
              message: `✅ Cherry-picked commit ${message.payload.sha.slice(0, 7)} successfully!`,
            },
          });
          break;
        }

        case 'requestRebasePreview': {
          const commits = await git.getRebasePreview(message.payload.baseBranch);
          this.postMessage({
            type: 'rebasePreviewLoaded',
            payload: { baseBranch: message.payload.baseBranch, commits },
          });
          break;
        }

        case 'requestWorktrees': {
          const worktrees = await git.listWorktrees();
          this.postMessage({
            type: 'worktreesLoaded',
            payload: { worktrees },
          });
          break;
        }

        case 'createWorktree': {
          await git.createWorktree(message.payload.path, message.payload.branch);
          const worktrees = await git.listWorktrees();
          this.postMessage({
            type: 'toolkitActionComplete',
            payload: {
              success: true,
              message: `Worktree added at ${message.payload.path} for branch ${message.payload.branch}`,
            },
          });
          this.postMessage({ type: 'worktreesLoaded', payload: { worktrees } });
          break;
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.postMessage({
        type: 'toolkitActionComplete',
        payload: { success: false, message: msg },
      });
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'toolkit.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'toolkit.css')
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
  <title>GitSnap Advanced Toolkit</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  public dispose() {
    ToolkitPanel.currentPanel = undefined;
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
