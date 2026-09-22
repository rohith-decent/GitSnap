import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateCommitMessage, generateBranchInsight, translateNlCommand, generatePrDescription, generateStashSummary, truncateDiff, cleanCommitMessage, getProvider } from './index';
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
  getCustomSystemPrompt: vi.fn(() => ''),
}));

describe('AI Module Helpers & Providers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(configModule.getConfiguredProvider).mockReturnValue('groq');
    vi.mocked(configModule.isAiEnabled).mockReturnValue(true);
    vi.mocked(configModule.getCustomSystemPrompt).mockReturnValue('');
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

  it('translateNlCommand successfully parses JSON command plans', async () => {
    const Groq = (await import('groq-sdk')).default;
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: '```json\n{"commands":[{"op":"switchBranch","args":{"name":"main"},"description":"Switch to main"}]}\n```',
          },
        },
      ],
    });
    vi.mocked(Groq).mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    } as any));

    vi.mocked(configModule.getConfiguredProvider).mockReturnValue('groq');
    const plan = await translateNlCommand('switch to main', 'key', 'llama-3.3-70b-versatile');
    expect(plan.commands).toHaveLength(1);
    expect(plan.commands[0].op).toBe('switchBranch');
    expect(plan.commands[0].args.name).toBe('main');
  });

  it('generatePrDescription parses title and body from AI JSON output', async () => {
    const Groq = (await import('groq-sdk')).default;
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: '{"title":"feat(auth): add OAuth2","body":"## Summary\\nAdded OAuth2 support."}',
          },
        },
      ],
    });
    vi.mocked(Groq).mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    } as any));

    vi.mocked(configModule.getConfiguredProvider).mockReturnValue('groq');
    const pr = await generatePrDescription(['feat(auth): add OAuth2'], 'key', 'llama-3.3-70b-versatile');
    expect(pr.title).toBe('feat(auth): add OAuth2');
    expect(pr.body).toContain('Added OAuth2 support');
  });

  it('generateStashSummary returns a 1-sentence stash description', async () => {
    const Groq = (await import('groq-sdk')).default;
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: 'Work in progress refactoring auth module',
          },
        },
      ],
    });
    vi.mocked(Groq).mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    } as any));

    vi.mocked(configModule.getConfiguredProvider).mockReturnValue('groq');
    const summary = await generateStashSummary('mock diff text', 'key', 'llama-3.3-70b-versatile');
    expect(summary).toBe('Work in progress refactoring auth module');
  });
});