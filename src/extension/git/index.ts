import simpleGit, { SimpleGit } from 'simple-git';
import * as vscode from 'vscode';
import {
  GitSnapError,
  NoRemoteError,
  MergeConflictError,
  NothingToCommitError,
  NotAGitRepoError,
  BranchAlreadyExistsError,
  UnmergedBranchDeleteError,
  UncommittedChangesError,
} from './errors';

// ─────────────────────────────────────────────────────────────
// Type Definitions
// ─────────────────────────────────────────────────────────────
export interface BranchInfo {
  name: string;
  current: boolean;
  remote: boolean;
  ahead: number;
  behind: number;
  lastCommitDate: string;
  lastCommitAuthor: string;
  isStale?: boolean;
  isDiverged?: boolean;
  isReadyToMerge?: boolean;
  aiInsight?: string | null;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function getWorkspacePath(): string {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    throw new NotAGitRepoError();
  }
  return workspaceFolders[0].uri.fsPath;
}

function getGit(): SimpleGit {
  const workspacePath = getWorkspacePath();
  return simpleGit(workspacePath);
}

// ─────────────────────────────────────────────────────────────
// Staging & Diff Operations
// ─────────────────────────────────────────────────────────────
export async function getDiff(): Promise<string> {
  try {
    const git = getGit();

    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      throw new NotAGitRepoError();
    }

    const diff = await git.diff(['--cached']);
    return diff;
  } catch (error) {
    if (error instanceof GitSnapError) {
      throw error;
    }
    throw new Error(`Failed to get diff: ${error}`);
  }
}

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
// Commit & Push Operations
// ─────────────────────────────────────────────────────────────
export async function commit(message: string): Promise<void> {
  try {
    const git = getGit();

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
    try {
      await git.push(['-u', remoteName, currentBranch]);
    } catch (firstError) {
      const firstMsg = firstError instanceof Error ? firstError.message : String(firstError);

      if (
        firstMsg.includes('set-upstream') ||
        firstMsg.includes('has no upstream') ||
        firstMsg.includes('did not match any')
      ) {
        // Fall back to plain push if branch already tracks an upstream
        await git.push(remoteName, currentBranch);
      } else {
        throw firstError;
      }
    }
  } catch (error) {
    if (error instanceof GitSnapError) {
      throw error;
    }

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

export async function undoLastCommit(): Promise<void> {
  try {
    const git = getGit();

    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      throw new NotAGitRepoError();
    }

    // Verify there is at least one commit to undo
    const log = await git.log({ maxCount: 1 });
    if (log.total === 0) {
      throw new Error('No commits to undo in this repository.');
    }

    // Soft reset: uncommits but keeps all changes staged
    await git.reset(['--soft', 'HEAD~1']);
  } catch (error) {
    if (error instanceof GitSnapError) {
      throw error;
    }
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to undo last commit: ${msg}`);
  }
}

// ─────────────────────────────────────────────────────────────
// Branch Operations
// ─────────────────────────────────────────────────────────────
export async function listBranches(): Promise<BranchInfo[]> {
  const git = getGit();
  const branches: BranchInfo[] = [];

  const branchSummary = await git.branch(['-vv', '--all']);

  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  for (const [name, detail] of Object.entries(branchSummary.branches)) {
    if (name.startsWith('remotes/')) {
      continue;
    }

    let ahead = 0;
    let behind = 0;
    let tracking: string | undefined;

    try {
      const upstream = await git.raw(['rev-parse', '--abbrev-ref', `${name}@{upstream}`]);
      tracking = upstream.trim();
    } catch {
      // Upstream might not be set
    }

    if (tracking) {
      try {
        const revList = await git.raw(['rev-list', '--left-right', '--count', `${name}...${tracking}`]);
        const [aheadCount, behindCount] = revList.trim().split('\t').map(Number);
        ahead = aheadCount || 0;
        behind = behindCount || 0;
      } catch {
        // rev-list failed
      }
    }

    let lastCommitDate = 'Unknown';
    let lastCommitAuthor = 'Unknown';

    if (detail.commit) {
      try {
        const showResult = await git.raw(['show', '-s', '--format=%ci|%an', detail.commit]);
        const [dateStr, authorStr] = showResult.trim().split('|');
        if (dateStr) {
          lastCommitDate = dateStr;
        }
        if (authorStr) {
          lastCommitAuthor = authorStr;
        }
      } catch {
        // show failed
      }
    }

    const commitTime = new Date(lastCommitDate).getTime();
    const isStale = !isNaN(commitTime) && now - commitTime > thirtyDaysMs;
    const isDiverged = ahead > 0 && behind > 0;
    const isReadyToMerge = ahead > 0 && behind === 0;

    branches.push({
      name: name.replace('refs/heads/', ''),
      current: name === branchSummary.current,
      remote: false,
      ahead,
      behind,
      lastCommitDate,
      lastCommitAuthor,
      isStale,
      isDiverged,
      isReadyToMerge,
    });
  }

  return branches.sort((a, b) => {
    if (a.current) {
      return -1;
    }
    if (b.current) {
      return 1;
    }
    return new Date(b.lastCommitDate).getTime() - new Date(a.lastCommitDate).getTime();
  });
}

export async function switchBranch(name: string): Promise<void> {
  try {
    await getGit().checkout(name);
  } catch (error) {
    if (error instanceof GitSnapError) throw error;
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('local changes') || msg.includes('overwritten by checkout')) {
      throw new UncommittedChangesError();
    }
    throw new Error(`Failed to switch to branch '${name}': ${msg}`);
  }
}

export async function createBranch(name: string, from?: string): Promise<void> {
  try {
    const git = getGit();
    if (from) {
      await git.checkoutBranch(name, from);
    } else {
      await git.checkoutLocalBranch(name);
    }
  } catch (error) {
    if (error instanceof GitSnapError) throw error;
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('already exists')) {
      throw new BranchAlreadyExistsError(name);
    }
    throw new Error(`Failed to create branch '${name}': ${msg}`);
  }
}

export async function deleteBranch(name: string, force: boolean = false): Promise<void> {
  try {
    await getGit().deleteLocalBranch(name, force);
  } catch (error) {
    if (error instanceof GitSnapError) throw error;
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('not fully merged')) {
      throw new UnmergedBranchDeleteError(name);
    }
    throw new Error(`Failed to delete branch '${name}': ${msg}`);
  }
}

export async function fetchAll(): Promise<void> {
  try {
    await getGit().fetch();
  } catch (error) {
    if (error instanceof GitSnapError) throw error;
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch branches: ${msg}`);
  }
}

export async function getLog(maxCount: number = 5): Promise<string> {
  try {
    const git = getGit();
    const log = await git.log({ maxCount });
    if (log.all.length === 0) {
      return 'No commits found.';
    }
    return log.all.map((c) => `${c.hash.substring(0, 7)} - ${c.message} (${c.author_name})`).join('\n');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get commit log: ${msg}`);
  }
}

export async function stash(message?: string): Promise<void> {
  try {
    const git = getGit();
    if (message) {
      await git.stash(['push', '-m', message]);
    } else {
      await git.stash();
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to stash changes: ${msg}`);
  }
}