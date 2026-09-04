import { GoogleGenAI } from '@google/genai';
import { SYSTEM_PROMPT } from './prompts';

// Truncate diff if it's too long (keep the tail, since recent changes are most relevant)
function truncateDiff(diff: string, maxLength: number = 10000): string {
  if (diff.length <= maxLength) {
    return diff;
  }

  // Keep the last maxLength characters (tail truncation)
  const truncated = diff.slice(-maxLength);

  // Add a note so the model knows we truncated
  return `[Note: Diff was truncated to the most recent ${maxLength} characters. Focus on these changes.]\n\n${truncated}`;
}

// Strip markdown, quotes, and extra whitespace from AI output
function cleanCommitMessage(message: string): string {
  return message
    .trim()
    // Remove backticks
    .replace(/`/g, '')
    // Remove leading/trailing quotes
    .replace(/^["']|["']$/g, '')
    // Remove trailing period
    .replace(/\.$/, '')
    // Collapse multiple newlines into one
    .replace(/\n+/g, ' ')
    // Take only the first line (in case the model added extra lines)
    .split('\n')[0]
    .trim();
}

// Generate a commit message from a diff using Google Gemini
export async function generateCommitMessage(
  diff: string,
  apiKey: string | undefined,
  model: string
): Promise<string> {
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error('No API key set. Open GitSnap Settings to add one.');
  }

  if (!diff || diff.trim().length === 0) {
    return 'chore: update code';
  }

  // Truncate if needed
  const truncatedDiff = truncateDiff(diff);

  try {
    // Initialize the Google GenAI client
    const client = new GoogleGenAI({ apiKey });

    // Retry logic: try up to 3 times with a short delay between attempts
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Call Gemini with system instruction + user prompt
        const response = await client.models.generateContent({
          model: model,
          contents: `Generate a commit message for this diff:\n\n${truncatedDiff}`,
          config: {
            systemInstruction: SYSTEM_PROMPT,
          },
        });

        // Extract the text from the response
        const rawText = response.text ?? '';

        // Clean the output
        const cleanedMessage = cleanCommitMessage(rawText);

        // Validate it's not empty
        if (cleanedMessage.length === 0) {
          return 'chore: update code';
        }

        return cleanedMessage;

      } catch (attemptError) {
        lastError = attemptError instanceof Error ? attemptError : new Error(String(attemptError));
        const errMsg = lastError.message;

        // Only retry on transient errors (503, 429, timeouts)
        const isRetryable =
          errMsg.includes('503') ||
          errMsg.includes('UNAVAILABLE') ||
          errMsg.includes('high demand') ||
          errMsg.includes('429') ||
          errMsg.includes('RESOURCE_EXHAUSTED') ||
          errMsg.includes('timeout') ||
          errMsg.includes('ECONNRESET');

        if (!isRetryable || attempt === maxRetries) {
          // Non-retryable error or out of retries — break and fall through to error handling
          break;
        }

        // Wait before retrying (1s, 2s, 3s)
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }

    // If we get here, all retries failed — throw the last error for translation below
    throw lastError ?? new Error('AI request failed after multiple retries');

  } catch (error) {
    // Translate common Google GenAI errors into friendly messages
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Google's SDK throws errors with specific patterns
    if (
      errorMessage.includes('API_KEY_INVALID') ||
      errorMessage.includes('401') ||
      errorMessage.includes('Unauthorized') ||
      errorMessage.includes('API key not valid')
    ) {
      throw new Error('Invalid API key. Check your GitSnap Settings.');
    }

    if (
      errorMessage.includes('429') ||
      errorMessage.includes('quota') ||
      errorMessage.includes('rate limit') ||
      errorMessage.includes('RESOURCE_EXHAUSTED')
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

    // Generic fallback
    throw new Error(`AI request failed: ${errorMessage}`);
  }
}