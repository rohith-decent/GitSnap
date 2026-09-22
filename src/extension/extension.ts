import * as vscode from 'vscode';
import * as git from './git';
import * as ai from './ai';
import * as secrets from './secrets';
import { isAiEnabled } from './ai/config';
import { createSettingsPanel } from './webview/panel';
import { BranchDashboardPanel } from './webview/branchPanel';
import { CommitEditorPanel } from './webview/commitEditorPanel';
import { ToolkitPanel } from './webview/toolkitPanel';
import { PrPrepPanel } from './webview/prPrepPanel';
import { executeNlOperation } from './git/nlExecutor';
import type { NlHistoryEntry } from '../types/nl';

let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel('GitSnap');
    outputChannel.appendLine('GitSnap activated successfully.');

    // ── Status Bar Item ──
    const statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        100
    );
    statusBarItem.text = '$(zap) GitSnap';
    statusBarItem.tooltip = 'GitSnap: Fast AI Commit & Push (Ctrl+Alt+Enter)';
    statusBarItem.command = 'gitsnap.aiCommitAndPush';
    statusBarItem.show();

    // ── Command: Show Quick Action Dropdown Menu ──
    const showMenuCmd = vscode.commands.registerCommand('gitsnap.showMenu', async () => {
        const items: (vscode.QuickPickItem & { command: string })[] = [
            {
                label: '$(zap)  AI Commit & Push',
                description: 'Ctrl+Alt+Enter',
                detail: 'Auto-stage, generate commit message with AI, and push upstream',
                command: 'gitsnap.aiCommitAndPush',
            },
            {
                label: '$(git-commit)  Commit Editor',
                description: 'Ctrl+Alt+C',
                detail: 'Side-by-side diff review & customize your commit message',
                command: 'gitsnap.openCommitEditor',
            },
            {
                label: '$(git-branch)  Branch Dashboard',
                description: 'Ctrl+Alt+B',
                detail: 'Visual branch overview, ahead/behind tracking & branch actions',
                command: 'gitsnap.openBranchDashboard',
            },
            {
                label: '$(tools)  Advanced Toolkit',
                description: 'Ctrl+Alt+T',
                detail: 'Stashes, log explorer, cherry-pick commits & worktrees',
                command: 'gitsnap.openToolkit',
            },
            {
                label: '$(git-pull-request)  PR Prep',
                description: 'Ctrl+Alt+P',
                detail: 'Generate PR title and markdown summary from branch diff',
                command: 'gitsnap.openPrPrep',
            },
            {
                label: '$(sparkle)  NL Git',
                description: 'Ctrl+Alt+N',
                detail: 'Describe a Git action in plain English',
                command: 'gitsnap.openNlInterface',
            },
            {
                label: '$(discard)  Undo Last Commit',
                description: 'Ctrl+Alt+Z',
                detail: 'Soft reset HEAD~1 (keeps modified files staged)',
                command: 'gitsnap.undoLastCommit',
            },
            {
                label: '$(gear)  Settings',
                description: '',
                detail: 'Configure AI provider, model selection, and templates',
                command: 'gitsnap.openSettings',
            },
            {
                label: '$(key)  Set API Key',
                description: '',
                detail: 'Securely store cloud provider API key in SecretStorage',
                command: 'gitsnap.setApiKey',
            },
        ];

        const picked = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a GitSnap action...',
            matchOnDescription: true,
            matchOnDetail: true,
        });

        if (picked) {
            await vscode.commands.executeCommand(picked.command);
        }
    });

    // ── Command: Fast AI Commit & Push ──
    const aiCommitAndPushCmd = vscode.commands.registerCommand(
        'gitsnap.aiCommitAndPush',
        async () => {
            await runAiCommitAndPush(context);
        }
    );

    // ── Command: Open Commit Editor ──
    const openCommitEditorCmd = vscode.commands.registerCommand(
        'gitsnap.openCommitEditor',
        async () => {
            await CommitEditorPanel.render(context.extensionUri, context);
        }
    );

    // ── Command: Open Settings ──
    const openSettingsCmd = vscode.commands.registerCommand(
        'gitsnap.openSettings',
        () => {
            createSettingsPanel(context);
        }
    );

    // ── Command: Open Branch Dashboard ──
    const openBranchDashboardCmd = vscode.commands.registerCommand(
        'gitsnap.openBranchDashboard',
        () => {
            BranchDashboardPanel.render(context.extensionUri, context);
        }
    );

    // ── Command: Open Advanced Toolkit ──
    const openToolkitCmd = vscode.commands.registerCommand(
        'gitsnap.openToolkit',
        async () => {
            await ToolkitPanel.render(context.extensionUri, context);
        }
    );

    // ── Command: Open PR Prep Assistant ──
    const openPrPrepCmd = vscode.commands.registerCommand(
        'gitsnap.openPrPrep',
        async () => {
            await PrPrepPanel.render(context.extensionUri, context);
        }
    );

    // ── Command: Open Natural Language Interface ──
    const openNlInterfaceCmd = vscode.commands.registerCommand(
        'gitsnap.openNlInterface',
        async () => {
            await runNlInterface(context);
        }
    );

    // ── Command: Undo Last Commit (Soft Reset) ──
    const undoLastCommitCmd = vscode.commands.registerCommand(
        'gitsnap.undoLastCommit',
        async () => {
            try {
                await git.undoLastCommit();
                vscode.window.showInformationMessage('✅ Undo last commit succeeded. Changes remain staged.');
                outputChannel.appendLine('Soft reset executed: HEAD~1');
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                outputChannel.appendLine(`Undo failed: ${msg}`);
                vscode.window.showErrorMessage(`GitSnap Undo failed: ${msg}`);
            }
        }
    );

    // ── Command: Set API Key ──
    const setApiKeyCmd = vscode.commands.registerCommand(
        'gitsnap.setApiKey',
        async () => {
            const apiKey = await vscode.window.showInputBox({
                prompt: 'Enter your AI provider API key',
                password: true,
                ignoreFocusOut: true,
                placeHolder: 'e.g. gsk_... (Groq), sk-... (OpenAI), sk-ant-... (Anthropic)',
            });

            if (apiKey !== undefined && apiKey.trim().length > 0) {
                await secrets.storeApiKey(context, apiKey.trim());
                vscode.window.showInformationMessage('✅ API key saved securely in OS SecretStorage.');
            }
        }
    );

    // ── Register Disposables ──
    context.subscriptions.push(
        statusBarItem,
        showMenuCmd,
        aiCommitAndPushCmd,
        openCommitEditorCmd,
        openSettingsCmd,
        openBranchDashboardCmd,
        openToolkitCmd,
        openPrPrepCmd,
        openNlInterfaceCmd,
        undoLastCommitCmd,
        setApiKeyCmd,
        outputChannel
    );
}

// ── Fast Stage, Commit & Push Pipeline ──
async function runAiCommitAndPush(context: vscode.ExtensionContext): Promise<void> {
    try {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'GitSnap',
                cancellable: false,
            },
            async (progress) => {
                progress.report({ message: 'Staging changes...' });
                await git.stageAll();

                progress.report({ message: 'Reading diff...' });
                const diff = await git.getDiff();

                if (!diff || diff.trim().length === 0) {
                    vscode.window.showInformationMessage('No changes detected — nothing to commit.');
                    return;
                }

                progress.report({ message: 'Drafting commit message...' });

                let commitMessage: string | undefined;

                if (isAiEnabled()) {
                    try {
                        const apiKey = await secrets.getApiKey(context);
                        const model = await secrets.getModel(context);

                        commitMessage = await ai.generateCommitMessage(diff, apiKey || '', model);
                    } catch (error) {
                        outputChannel.appendLine(`AI generation failed: ${error instanceof Error ? error.message : String(error)}`);

                        const manualInput = await vscode.window.showInputBox({
                            prompt: 'AI message generation failed — enter commit message manually',
                            placeHolder: 'feat: describe your change',
                            ignoreFocusOut: true,
                        });
                        if (manualInput === undefined) {
                            return;
                        }
                        commitMessage = manualInput.trim() || 'chore: update code';
                    }
                } else {
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

                progress.report({ message: 'Committing changes...' });
                await git.commit(commitMessage);

                progress.report({ message: 'Pushing to remote...' });
                await git.push();

                vscode.window.showInformationMessage(`✅ Pushed: ${commitMessage}`);
                outputChannel.appendLine(`Pushed commit: ${commitMessage}`);
            }
        );
    } catch (error) {
        const rawMessage = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`ERROR: ${rawMessage}`);
        if (error instanceof Error && error.stack) {
            outputChannel.appendLine(error.stack);
        }
        vscode.window.showErrorMessage(rawMessage);
    }
}

// ── Natural Language Git Interface ──
async function runNlInterface(context: vscode.ExtensionContext): Promise<void> {
    try {
        const inputPrompt = await vscode.window.showInputBox({
            prompt: 'Describe what you want GitSnap to do',
            placeHolder: 'e.g. "switch to main branch", "undo last commit", "stash current work"',
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

        const results: string[] = [];
        for (const item of confirmed) {
            const output = await executeNlOperation(item.cmd);
            results.push(output);
        }

        const history = context.workspaceState.get<NlHistoryEntry[]>('gitsnap.nlHistory', []);
        history.unshift({
            timestamp: new Date().toISOString(),
            userPrompt: inputPrompt,
            commands: confirmed.map((c) => c.cmd),
            executed: true,
        });
        await context.workspaceState.update('gitsnap.nlHistory', history.slice(0, 20));

        vscode.window.showInformationMessage(`✅ Executed: ${results.join(' | ')}`);
        outputChannel.appendLine(`NL Executed: "${inputPrompt}" -> ${results.join('; ')}`);
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`NL Error: ${msg}`);
        vscode.window.showErrorMessage(`GitSnap NL Error: ${msg}`);
    }
}

export function deactivate() {}