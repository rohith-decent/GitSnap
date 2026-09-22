/**
 * Truncate diff if it's too long (keep the tail / most recent changes).
 */
export function truncateDiff(diff: string, maxLength: number = 10000): string {
  if (diff.length <= maxLength) {
    return diff;
  }

  const truncated = diff.slice(-maxLength);
  return `[Note: Diff was truncated to the most recent ${maxLength} characters. Focus on these changes.]\n\n${truncated}`;
}

/**
 * Strip markdown, quotes, trailing dots, and extra whitespace from AI output.
 */
export function cleanCommitMessage(message: string): string {
  if (!message) return '';

  let cleaned = message.trim().split(/\r?\n/)[0].trim();
  cleaned = cleaned.replace(/`/g, '');

  while (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  cleaned = cleaned.replace(/\.$/, '').trim();
  return cleaned;
}
