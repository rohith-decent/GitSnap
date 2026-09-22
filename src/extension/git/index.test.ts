import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as gitModule from './index';
import { NoRemoteError, UncommittedChangesError, BranchAlreadyExistsError, NotAGitRepoError } from './errors';

const mockCheckout = vi.fn();
const mockCheckoutLocalBranch = vi.fn();
const mockCheckoutBranch = vi.fn();
const mockDeleteLocalBranch = vi.fn();
const mockFetch = vi.fn();
const mockBranch = vi.fn();
const mockCheckIsRepo = vi.fn();
const mockReset = vi.fn();
const mockLog = vi.fn();

vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/mock/workspace' } }],
  },
}));

vi.mock('simple-git', () => ({
  default: vi.fn(() => ({
    checkIsRepo: mockCheckIsRepo,
    diff: vi.fn().mockResolvedValue('mock diff'),
    add: vi.fn(),
    commit: vi.fn(),
    reset: mockReset,
    log: mockLog,
    getRemotes: vi.fn().mockResolvedValue([]),
    branch: mockBranch,
    checkout: mockCheckout,
    checkoutLocalBranch: mockCheckoutLocalBranch,
    checkoutBranch: mockCheckoutBranch,
    deleteLocalBranch: mockDeleteLocalBranch,
    fetch: mockFetch,
    raw: vi.fn().mockImplementation((args: string[]) => {
      if (args[0] === 'rev-parse') return Promise.resolve('origin/main');
      if (args[0] === 'rev-list') return Promise.resolve('2\t1');
      if (args[0] === 'show') return Promise.resolve('2026-09-20 10:00:00 +0000|Test Author');
      return Promise.resolve('');
    }),
  })),
}));

describe('Git Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckIsRepo.mockResolvedValue(true);
    mockLog.mockResolvedValue({ total: 1 });
    mockBranch.mockResolvedValue({
      current: 'main',
      branches: {
        main: { current: true, name: 'main', commit: 'sha1' },
        'feature/test': { current: false, name: 'feature/test', commit: 'sha2' },
      },
    });
  });

  it('throws NoRemoteError when no remotes exist during push', async () => {
    await expect(gitModule.push()).rejects.toThrow(NoRemoteError);
  });

  it('listBranches returns branch metadata with ahead/behind counts', async () => {
    const branches = await gitModule.listBranches();
    expect(branches).toHaveLength(2);
    expect(branches[0].name).toBe('main');
    expect(branches[0].current).toBe(true);
    expect(branches[0].ahead).toBe(2);
    expect(branches[0].behind).toBe(1);
    expect(branches[0].lastCommitAuthor).toBe('Test Author');
  });

  it('switchBranch calls checkout and translates errors', async () => {
    mockCheckout.mockResolvedValueOnce(undefined);
    await gitModule.switchBranch('feature/test');
    expect(mockCheckout).toHaveBeenCalledWith('feature/test');

    mockCheckout.mockRejectedValueOnce(new Error('local changes would be overwritten by checkout'));
    await expect(gitModule.switchBranch('feature/test')).rejects.toThrow(UncommittedChangesError);
  });

  it('createBranch creates a new branch locally or from a base branch', async () => {
    mockCheckoutLocalBranch.mockResolvedValueOnce(undefined);
    await gitModule.createBranch('new-branch');
    expect(mockCheckoutLocalBranch).toHaveBeenCalledWith('new-branch');

    mockCheckoutBranch.mockResolvedValueOnce(undefined);
    await gitModule.createBranch('new-branch', 'main');
    expect(mockCheckoutBranch).toHaveBeenCalledWith('new-branch', 'main');

    mockCheckoutLocalBranch.mockRejectedValueOnce(new Error("a branch named 'new-branch' already exists"));
    await expect(gitModule.createBranch('new-branch')).rejects.toThrow(BranchAlreadyExistsError);
  });

  it('deleteBranch deletes a local branch', async () => {
    mockDeleteLocalBranch.mockResolvedValueOnce(undefined);
    await gitModule.deleteBranch('old-branch', false);
    expect(mockDeleteLocalBranch).toHaveBeenCalledWith('old-branch', false);
  });

  it('fetchAll triggers git fetch', async () => {
    mockFetch.mockResolvedValueOnce(undefined);
    await gitModule.fetchAll();
    expect(mockFetch).toHaveBeenCalled();
  });

  describe('undoLastCommit', () => {
    it('should call git.reset with --soft HEAD~1', async () => {
      mockReset.mockResolvedValueOnce('');

      await gitModule.undoLastCommit();

      expect(mockReset).toHaveBeenCalledWith(['--soft', 'HEAD~1']);
    });

    it('should throw error when there are no commits to undo', async () => {
      mockLog.mockResolvedValueOnce({ total: 0 });

      await expect(gitModule.undoLastCommit()).rejects.toThrow('No commits to undo');
    });

    it('should throw NotAGitRepoError when not in a git repo', async () => {
      mockCheckIsRepo.mockResolvedValueOnce(false);

      await expect(gitModule.undoLastCommit()).rejects.toThrow(NotAGitRepoError);
    });
  });
});