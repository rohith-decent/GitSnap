import Groq from 'groq-sdk';
import { SYSTEM_PROMPT } from './prompts';

// ─────────────────────────────────────────────────────────────
// Truncate diff if it's too long (keep the tail)
// ─────────────────────────────────────────────────────────────
function truncateDiff(diff: string, maxLength: number = 10000): string {
  if (diff.length <= maxLength) {
    return diff;
  }

  const truncated = diff.slice(-maxLength);
  return `[Note: Diff was truncated to the most recent ${maxLength} characters. Focus on these changes.]\n\n${truncated}`;
}

// ─────────────────────────────────────────────────────────────
// Strip markdown, quotes, and extra whitespace from AI output
// ─────────────────────────────────────────────────────────────
function cleanCommitMessage(message: string): string {
  return message
    .trim()
    .replace(/`/g, '')
    .replace(/^["']|["']$/g, '')
    .replace(/\.$/, '')
    .replace(/\n+/g, ' ')
    .split('\n')[0]
    .trim();
}

// ─────────────────────────────────────────────────────────────
// Generate a commit message from a diff using Groq
// ─────────────────────────────────────────────────────────────
export async function generateCommitMessage(
  diff: string,
  apiKey: string,
  model: string
): Promise<string> {
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error('No API key set. Open GitSnap Settings to add one.');
  }

  if (!diff || diff.trim().length === 0) {
    return 'chore: update code';
  }

  const truncatedDiff = truncateDiff(diff);

  try {
    // Initialize the Groq client
    const client = new Groq({ apiKey });

    // Retry logic for transient errors
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await client.chat.completions.create({
          model: model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: `Generate a commit message for this diff:\n\n${truncatedDiff}`,
            },
          ],
          temperature: 0.3, // Lower temperature = more deterministic output
          max_tokens: 100,  // Commit messages are short
        });

        const rawText = response.choices[0]?.message?.content ?? '';
        const cleanedMessage = cleanCommitMessage(rawText);

        if (cleanedMessage.length === 0) {
          return 'chore: update code';
        }

        return cleanedMessage;
      } catch (attemptError) {
        lastError = attemptError instanceof Error ? attemptError : new Error(String(attemptError));
        const errMsg = lastError.message;

        // Only retry on transient errors (429, 503, timeouts)
        const isRetryable =
          errMsg.includes('429') ||
          errMsg.includes('503') ||
          errMsg.includes('rate limit') ||
          errMsg.includes('overloaded') ||
          errMsg.includes('timeout') ||
          errMsg.includes('ECONNRESET');

        if (!isRetryable || attempt === maxRetries) {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }

    throw lastError ?? new Error('AI request failed after multiple retries');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Translate Groq-specific errors into friendly messages
    if (
      errorMessage.includes('401') ||
      errorMessage.includes('Unauthorized') ||
      errorMessage.includes('Invalid API Key') ||
      errorMessage.includes('api_key')
    ) {
      throw new Error('Invalid API key. Check your GitSnap Settings.');
    }

    if (
      errorMessage.includes('429') ||
      errorMessage.includes('rate limit') ||
      errorMessage.includes('quota')
    ) {
      throw new Error('Rate limit exceeded. Wait a moment and try again.');
    }

    if (
      errorMessage.includes('timeout') ||
      errorMessage.includes('network') ||
      errorMessage.includes('ECONNREFUSED') ||
      errorMessage.includes('fetch failed')
    ) {
      throw new Error("Couldn't reach the AI provider. Check your connection and try again.");
    }

    throw new Error(`AI request failed: ${errorMessage}`);
  }
}