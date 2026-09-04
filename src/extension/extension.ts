import * as vscode from 'vscode';
import * as git from './git';
import * as ai from './ai';
import * as secrets from './secrets';

// Create a dedicated output channel for debugging
let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
    // Create the output channel (visible in View > Output > GitSnap)
    outputChannel = vscode.window.createOutputChannel('GitSnap');
    outputChannel.appendLine('GitSnap activated');

    // ── Status Bar Button ──
    const statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        100
    );
    statusBarItem.text = '⚡ GitSnap';
    statusBarItem.tooltip = 'AI Commit & Push';
    statusBarItem.command = 'gitsnap.aiCommitAndPush';
    statusBarItem.show();

    // ── Register Commands ──
    const aiCommitAndPushCmd = vscode.commands.registerCommand(
        'gitsnap.aiCommitAndPush',
        async () => {
            await runAiCommitAndPush(context);
        }
    );

    const openSettingsCmd = vscode.commands.registerCommand(
        'gitsnap.openSettings',
        () => {
            vscode.window.showInformationMessage('Settings panel coming soon!');
        }
    );

    const setApiKeyCmd = vscode.commands.registerCommand(
        'gitsnap.setApiKey',
        async () => {
            const apiKey = await vscode.window.showInputBox({
                prompt: 'Enter your AI provider API key',
                password: true,
                ignoreFocusOut: true,
                placeHolder: 'AIzaSy... (your Gemini API key)',
            });

            if (apiKey) {
                await secrets.storeApiKey(context, apiKey);
                vscode.window.showInformationMessage('✅ API key saved securely');
            }
        }
    );

    // ── Push disposables to context.subscriptions ──
    context.subscriptions.push(statusBarItem);
    context.subscriptions.push(aiCommitAndPushCmd);
    context.subscriptions.push(openSettingsCmd);
    context.subscriptions.push(setApiKeyCmd);
    context.subscriptions.push(outputChannel);
}

// ── The Main Pipeline ──
async function runAiCommitAndPush(context: vscode.ExtensionContext): Promise<void> {
    try {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'GitSnap',
                cancellable: false,
            },
            async (progress) => {
                // Step 1: Stage all changes
                progress.report({ message: 'Staging changes...' });
                await git.stageAll();

                // Step 2: Get the diff
                progress.report({ message: 'Reading diff...' });
                const diff = await git.getDiff();

                if (!diff || diff.trim().length === 0) {
                    vscode.window.showInformationMessage('No changes detected — nothing to commit.');
                    return;
                }

                // Step 3: Generate commit message via AI
                progress.report({ message: 'Generating commit message...' });

                const apiKey = await secrets.getApiKey(context);
                const model = await secrets.getModel(context);

                const commitMessage = await ai.generateCommitMessage(diff, apiKey, model);

                // Step 4: Commit
                progress.report({ message: 'Committing...' });
                await git.commit(commitMessage);

                // Step 5: Push
                progress.report({ message: 'Pushing to remote...' });
                await git.push();

                // Step 6: Success!
                vscode.window.showInformationMessage(`✅ Pushed: ${commitMessage}`);
                outputChannel.appendLine(`Success: ${commitMessage}`);
            }
        );
    } catch (error) {
        // Log the full error for debugging
        const rawMessage = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`ERROR: ${rawMessage}`);
        if (error instanceof Error && error.stack) {
            outputChannel.appendLine(error.stack);
        }

        // Show friendly message to user
        vscode.window.showErrorMessage(rawMessage);
    }
}

export function deactivate() {
    // Cleanup happens automatically via context.subscriptions
}