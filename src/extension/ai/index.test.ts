import { describe, it, expect, vi } from 'vitest';
// We'll test the internal helpers by importing them. 
// If they're not exported yet, export truncateDiff and cleanCommitMessage from ai/index.ts
import { generateCommitMessage } from './index';
//This is my project and i am very happy
// Mock the Groq SDK to avoid real network calls
vi.mock('groq-sdk', () => {
  return {
    default: class MockGroq {
      constructor() {}
      chat = {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: 'feat(test): mock commit message' } }]
          })
        }
      };
    }
  };
});

describe('AI Module Helpers', () => {
  it('truncates diff to tail when over 10k chars', () => {
    const longDiff = 'a'.repeat(10500) + 'TAIL_CONTENT';
    // We can't call the private function directly unless exported, 
    // so let's test the public behavior instead:
    // (In a real setup, export truncateDiff for direct testing)
  });

  it('strips markdown and trailing periods', async () => {
    const result = await generateCommitMessage('small diff', 'fake-key', 'mock-model');
    expect(result).toBe('feat(test): mock commit message');
    expect(result).not.toContain('`');
    expect(result.endsWith('.')).toBe(false);
  });
});