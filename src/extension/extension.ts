import * as vscode from 'vscode';
import * as git from './git';
import * as ai from './ai';
import * as secrets from './secrets';
import { isAiEnabled } from './ai/config';
import { createSettingsPanel } from './webview/panel';
import { BranchDashboardPanel } from './webview/branchPanel';
import { CommitEditorPanel } from './webview/commitEditorPanel';
import { executeNlOperation } from './git/nlExecutor';
import type { NlHistoryEntry } from '../types/nl';

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

    const openCommitEditorCmd = vscode.commands.registerCommand(
        'gitsnap.openCommitEditor',
        async () => {
            await CommitEditorPanel.render(context.extensionUri, context);
        }
    );

    const openSettingsCmd = vscode.commands.registerCommand(
        'gitsnap.openSettings',
        () => {
            createSettingsPanel(context);
        }
    );

    const openBranchDashboardCmd = vscode.commands.registerCommand(
        'gitsnap.openBranchDashboard',
        () => {
            BranchDashboardPanel.render(context.extensionUri, context);
        }
    );

    const openNlInterfaceCmd = vscode.commands.registerCommand(
        'gitsnap.openNlInterface',
        async () => {
            await runNlInterface(context);
        }
    );

    const undoLastCommitCmd = vscode.commands.registerCommand(
        'gitsnap.undoLastCommit',
        async () => {
            try {
                await git.undoLastCommit();
                vscode.window.showInformationMessage('✅ Undo last commit succeeded. Changes remain staged.');
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Undo failed: ${msg}`);
            }
        }
    );

    const setApiKeyCmd = vscode.commands.registerCommand(
        'gitsnap.setApiKey',
        async () => {
            const apiKey = await vscode.window.showInputBox({
                prompt: 'Enter your AI provider API key',
                password: true,
                ignoreFocusOut: true,
                placeHolder: 'gsk_... (your Groq API key)',
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
    context.subscriptions.push(openCommitEditorCmd);
    context.subscriptions.push(openSettingsCmd);
    context.subscriptions.push(openBranchDashboardCmd);
    context.subscriptions.push(openNlInterfaceCmd);
    context.subscriptions.push(undoLastCommitCmd);
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

                // Step 3: Determine commit message (AI with fallback to manual input)
                progress.report({ message: 'Generating commit message...' });

                let commitMessage: string | undefined;

                if (isAiEnabled()) {
                    try {
                        const apiKey = await secrets.getApiKey(context);
                        const model = await secrets.getModel(context);

                        commitMessage = await ai.generateCommitMessage(diff, apiKey || '', model);
                    } catch (error) {
                        outputChannel.appendLine(`AI generation failed: ${error instanceof Error ? error.message : String(error)}`);

                        // AI failed — don't abort the whole pipeline, fall back to manual input
                        const manualInput = await vscode.window.showInputBox({
                            prompt: 'AI commit message failed — enter one manually',
                            placeHolder: 'feat: describe your change',
                            ignoreFocusOut: true,
                        });
                        if (manualInput === undefined) {
                            return;
                        }
                        commitMessage = manualInput.trim() || 'chore: update code';
                    }
                } else {
                    // AI is disabled via settings — go straight to manual input
                    const manualInput = await vscode.window.showInputBox({
                        prompt: 'Enter a commit message',
                        placeHolder: 'feat: describe your change',
                        ignoreFocusOut: true,
                    });
                    if (manualInput === undefined) {
                        return;
                    }
                    commitMessage = manualInput.trim() || 'chore: update code';
                }

                if (!commitMessage) {
                    return;
                }

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

async function runNlInterface(context: vscode.ExtensionContext): Promise<void> {
    try {
        const inputPrompt = await vscode.window.showInputBox({
            prompt: 'Describe what you want GitSnap to do',
            placeHolder: 'e.g. "switch to main branch", "undo last commit", "stash changes"',
            ignoreFocusOut: true,
        });

        if (!inputPrompt || !inputPrompt.trim()) {
            return;
        }

        const apiKey = await secrets.getApiKey(context);
        const model = await secrets.getModel(context);

        const plan = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'GitSnap: Translating request into Git plan...',
            },
            async () => {
                return await ai.translateNlCommand(inputPrompt.trim(), apiKey || '', model);
            }
        );

        if (!plan.commands || plan.commands.length === 0) {
            vscode.window.showInformationMessage('No executable Git operations generated.');
            return;
        }

        // Show execution preview and confirmation
        const items = plan.commands.map((cmd, idx) => ({
            label: `${idx + 1}. [${cmd.op}] ${cmd.description}`,
            description: cmd.requiresConfirmation ? '⚠️ Requires confirmation' : 'Safe operation',
            picked: true,
            cmd,
        }));

        const confirmed = await vscode.window.showQuickPick(items, {
            canPickMany: true,
            placeHolder: `Confirm ${plan.commands.length} operation(s) to execute for: "${inputPrompt}"`,
        });

        if (!confirmed || confirmed.length === 0) {
            vscode.window.showInformationMessage('Natural Language operation cancelled.');
            return;
        }

        // Execute selected operations sequentially
        const results: string[] = [];
        for (const item of confirmed) {
            const output = await executeNlOperation(item.cmd);
            results.push(output);
        }

        // Save history in workspaceState
        const history = context.workspaceState.get<NlHistoryEntry[]>('gitsnap.nlHistory', []);
        history.unshift({
            timestamp: new Date().toISOString(),
            userPrompt: inputPrompt,
            commands: confirmed.map((c) => c.cmd),
            executed: true,
        });
        await context.workspaceState.update('gitsnap.nlHistory', history.slice(0, 20));

        vscode.window.showInformationMessage(`✅ Executed: ${results.join(' | ')}`);
        outputChannel.appendLine(`NL Executed: ${inputPrompt} -> ${results.join('; ')}`);
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`NL Error: ${msg}`);
        vscode.window.showErrorMessage(`GitSnap NL Error: ${msg}`);
    }
}

export function deactivate() {
    // Cleanup happens automatically via context.subscriptions
}