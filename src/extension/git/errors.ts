// Custom error types for friendly error messages
export class GitSnapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitSnapError';
  }
}

export class NoRemoteError extends GitSnapError {
  constructor() {
    super('This repo has no remote to push to. Add one with a Git hosting provider first.');
    this.name = 'NoRemoteError';
  }
}

export class MergeConflictError extends GitSnapError {
  constructor() {
    super('Your branch is behind the remote. Pull the latest changes, then try again.');
    this.name = 'MergeConflictError';
  }
}

export class NothingToCommitError extends GitSnapError {
  constructor() {
    super('No changes detected — nothing to commit.');
    this.name = 'NothingToCommitError';
  }
}

export class NotAGitRepoError extends GitSnapError {
  constructor() {
    super('The current folder is not a Git repository. Open a Git repo first.');
    this.name = 'NotAGitRepoError';
  }
}

export class BranchAlreadyExistsError extends GitSnapError {
  constructor(branchName: string) {
    super(`Branch '${branchName}' already exists.`);
    this.name = 'BranchAlreadyExistsError';
  }
}

export class UnmergedBranchDeleteError extends GitSnapError {
  constructor(branchName: string) {
    super(`Branch '${branchName}' is not fully merged. Use force delete to delete it anyway.`);
    this.name = 'UnmergedBranchDeleteError';
  }
}

export class UncommittedChangesError extends GitSnapError {
  constructor() {
    super('You have uncommitted local changes. Please commit or stash them before switching branches.');
    this.name = 'UncommittedChangesError';
  }
}

export class CherryPickConflictError extends GitSnapError {
  constructor(sha: string) {
    super(`Cherry-pick of commit ${sha.slice(0, 7)} produced conflicts. Resolve conflicts manually or run 'git cherry-pick --abort'.`);
    this.name = 'CherryPickConflictError';
  }
}

export class WorktreeError extends GitSnapError {
  constructor(message: string) {
    super(`Worktree operation failed: ${message}`);
    this.name = 'WorktreeError';
  }
}