import simpleGit, { SimpleGit } from 'simple-git';
import * as vscode from 'vscode';
import {
  GitSnapError,
  NoRemoteError,
  MergeConflictError,
  NothingToCommitError,
  NotAGitRepoError,
} from './errors';

// ─────────────────────────────────────────────────────────────
// Helper: Get the currently open workspace folder path
// ─────────────────────────────────────────────────────────────
function getWorkspacePath(): string {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    throw new NotAGitRepoError();
  }
  return workspaceFolders[0].uri.fsPath;
}

// ─────────────────────────────────────────────────────────────
// Helper: Create a simple-git instance scoped to the workspace
// ─────────────────────────────────────────────────────────────
function getGit(): SimpleGit {
  const workspacePath = getWorkspacePath();
  return simpleGit(workspacePath);
}

// ─────────────────────────────────────────────────────────────
// Get the diff of staged changes
// ─────────────────────────────────────────────────────────────
export async function getDiff(): Promise<string> {
  try {
    const git = getGit();

    // Verify this is actually a git repo
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      throw new NotAGitRepoError();
    }

    // Get the diff of staged (cached) changes
    const diff = await git.diff(['--cached']);
    return diff;
  } catch (error) {
    if (error instanceof GitSnapError) {
      throw error;
    }
    throw new Error(`Failed to get diff: ${error}`);
  }
}

// ─────────────────────────────────────────────────────────────
// Stage all changes (equivalent to `git add .`)
// ─────────────────────────────────────────────────────────────
export async function stageAll(): Promise<void> {
  try {
    const git = getGit();
    await git.add('.');
  } catch (error) {
    if (error instanceof GitSnapError) {
      throw error;
    }
    throw new Error(`Failed to stage changes: ${error}`);
  }
}

// ─────────────────────────────────────────────────────────────
// Commit staged changes with a given message
// ─────────────────────────────────────────────────────────────
export async function commit(message: string): Promise<void> {
  try {
    const git = getGit();

    // Check if there are staged changes to commit
    const status = await git.status();
    if (status.staged.length === 0) {
      throw new NothingToCommitError();
    }

    await git.commit(message);
  } catch (error) {
    if (error instanceof GitSnapError) {
      throw error;
    }
    throw new Error(`Failed to commit: ${error}`);
  }
}

// ─────────────────────────────────────────────────────────────
// Push to remote (with automatic upstream setup for new branches)
// ─────────────────────────────────────────────────────────────
export async function push(): Promise<void> {
  try {
    const git = getGit();

    // 1. Verify a remote exists
    const remotes = await git.getRemotes();
    if (remotes.length === 0) {
      throw new NoRemoteError();
    }

    // 2. Get the remote name (usually 'origin') and current branch
    const remoteName = remotes[0].name;
    const branchSummary = await git.branch();
    const currentBranch = branchSummary.current;

    // 3. Try pushing with automatic upstream setup
    //    The '-u' flag links the local branch to the remote branch,
    //    so future pushes don't need to specify the upstream again.
    try {
      await git.push(['-u', remoteName, currentBranch]);
    } catch (firstError) {
      const firstMsg = firstError instanceof Error ? firstError.message : String(firstError);

      // If the remote branch already exists but we got a different error,
      // fall back to a plain push (the branch already has an upstream).
      if (
        firstMsg.includes('set-upstream') ||
        firstMsg.includes('has no upstream') ||
        firstMsg.includes('did not match any')
      ) {
        // Try a plain push as a fallback
        await git.push(remoteName, currentBranch);
      } else {
        // Re-throw the original error for translation below
        throw firstError;
      }
    }
  } catch (error) {
    // Re-throw friendly errors as-is
    if (error instanceof GitSnapError) {
      throw error;
    }

    // Translate common simple-git errors into friendly messages
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes('non-fast-forward') || errorMessage.includes('rejected')) {
      throw new MergeConflictError();
    }

    if (errorMessage.includes('does not appear to be a git remote')) {
      throw new NoRemoteError();
    }

    if (
      errorMessage.includes('Authentication failed') ||
      errorMessage.includes('could not read Username') ||
      errorMessage.includes('Permission denied')
    ) {
      throw new Error(
        'Authentication failed. Make sure you are logged in to your Git hosting provider (GitHub/GitLab) and have push access to this repo.'
      );
    }

    throw new Error(`Failed to push: ${errorMessage}`);
  }
}