import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isAiEnabled, getConfiguredProvider } from './config';

const mockGet = vi.fn();

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: mockGet,
    })),
  },
}));

describe('AI Config Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('isAiEnabled returns boolean value from configuration', () => {
    mockGet.mockReturnValue(false);
    expect(isAiEnabled()).toBe(false);
    expect(mockGet).toHaveBeenCalledWith('ai.enabled', true);
  });

  it('isAiEnabled defaults to true when configuration value is undefined', () => {
    mockGet.mockReturnValue(undefined);
    expect(isAiEnabled()).toBe(true);
  });

  it('getConfiguredProvider returns string value from configuration', () => {
    mockGet.mockReturnValue('openai');
    expect(getConfiguredProvider()).toBe('openai');
    expect(mockGet).toHaveBeenCalledWith('ai.provider', 'groq');
  });

  it('getConfiguredProvider defaults to groq when configuration value is undefined', () => {
    mockGet.mockReturnValue(undefined);
    expect(getConfiguredProvider()).toBe('groq');
  });
});
