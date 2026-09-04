import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as gitModule from './index';
import { NoRemoteError } from './errors';

// ── Mock VS Code ──
// Fix: Provide 'workspace' as a top-level property, not inside 'default'.
// This matches how 'import * as vscode' expects to find it.
vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/mock/workspace' } }]
  }
}));

// ── Mock simple-git ──
// Fix: Ensure we return a fresh object on every call to simpleGit()
vi.mock('simple-git', () => {
  return {
    default: vi.fn(() => ({
      checkIsRepo: vi.fn().mockResolvedValue(true),
      diff: vi.fn().mockResolvedValue('mock diff'),
      add: vi.fn(),
      commit: vi.fn(),
      getRemotes: vi.fn().mockResolvedValue([]), // Empty array -> triggers NoRemoteError
      branch: vi.fn().mockResolvedValue({ current: 'main' }),
      push: vi.fn(),
    }))
  };
});

describe('Git Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws NoRemoteError when no remotes exist', async () => {
    await expect(gitModule.push()).rejects.toThrow(NoRemoteError);
  });
});