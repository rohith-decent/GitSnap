import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateCommitMessage, generateBranchInsight, translateNlCommand, truncateDiff, cleanCommitMessage, getProvider } from './index';
import * as configModule from './config';
import { GroqProvider } from './providers/groq';
import { OpenAiProvider } from './providers/openai';
import { AnthropicProvider } from './providers/anthropic';
import { OllamaProvider } from './providers/ollama';
import { TabbyProvider } from './providers/tabby';

vi.mock('groq-sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'feat(test): mock commit message' } }],
        }),
      },
    },
  })),
}));

vi.mock('./config', () => ({
  getConfiguredProvider: vi.fn(() => 'groq'),
  isAiEnabled: vi.fn(() => true),
}));

describe('AI Module Helpers & Providers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(configModule.getConfiguredProvider).mockReturnValue('groq');
  });

  it('truncates diff to tail when over 10000 chars', () => {
    const longDiff = 'a'.repeat(10500) + 'TAIL_CONTENT';
    const truncated = truncateDiff(longDiff, 10000);
    expect(truncated).toContain('[Note: Diff was truncated');
    expect(truncated.endsWith('TAIL_CONTENT')).toBe(true);
    expect(truncated.length).toBeLessThan(longDiff.length);
  });

  it('cleans commit message markdown, quotes, trailing dots, and newlines', () => {
    const raw = '`"feat(core): add feature."` \n extra text';
    const cleaned = cleanCommitMessage(raw);
    expect(cleaned).toBe('feat(core): add feature');
  });

  it('getProvider returns appropriate provider instances', () => {
    vi.mocked(configModule.getConfiguredProvider).mockReturnValue('groq');
    expect(getProvider('key')).toBeInstanceOf(GroqProvider);

    vi.mocked(configModule.getConfiguredProvider).mockReturnValue('openai');
    expect(getProvider('key')).toBeInstanceOf(OpenAiProvider);

    vi.mocked(configModule.getConfiguredProvider).mockReturnValue('anthropic');
    expect(getProvider('key')).toBeInstanceOf(AnthropicProvider);

    vi.mocked(configModule.getConfiguredProvider).mockReturnValue('ollama');
    expect(getProvider('')).toBeInstanceOf(OllamaProvider);

    vi.mocked(configModule.getConfiguredProvider).mockReturnValue('tabby');
    expect(getProvider('')).toBeInstanceOf(TabbyProvider);
  });

  it('throws an error if API key is missing for cloud providers', async () => {
    vi.mocked(configModule.getConfiguredProvider).mockReturnValue('groq');
    await expect(generateCommitMessage('diff', '', 'model')).rejects.toThrow('No API key set for groq');
  });

  it('generates clean commit message via provider', async () => {
    vi.mocked(configModule.getConfiguredProvider).mockReturnValue('groq');
    const result = await generateCommitMessage('diff content', 'test-key', 'llama-3.3-70b-versatile');
    expect(result).toBe('feat(test): mock commit message');
  });

  it('generateBranchInsight returns string summary or null if disabled', async () => {
    vi.mocked(configModule.isAiEnabled).mockReturnValue(false);
    const resultDisabled = await generateBranchInsight(
      { name: 'main', current: true, remote: false, ahead: 0, behind: 0, lastCommitDate: '2026-01-01', lastCommitAuthor: 'Alice' },
      'key',
      'model'
    );
    expect(resultDisabled).toBeNull();

    vi.mocked(configModule.isAiEnabled).mockReturnValue(true);
    const resultEnabled = await generateBranchInsight(
      { name: 'main', current: true, remote: false, ahead: 1, behind: 0, lastCommitDate: '2026-01-01', lastCommitAuthor: 'Alice' },
      'key',
      'model'
    );
    expect(typeof resultEnabled).toBe('string');
  });
});