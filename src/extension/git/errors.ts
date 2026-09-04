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