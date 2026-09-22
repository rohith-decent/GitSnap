import { getConfiguredProvider, isAiEnabled, getCustomSystemPrompt } from './config';
import { AiProvider } from './provider';
import { GroqProvider } from './providers/groq';
import { OpenAiProvider } from './providers/openai';
import { AnthropicProvider } from './providers/anthropic';
import { OllamaProvider } from './providers/ollama';
import { TabbyProvider } from './providers/tabby';
import { SYSTEM_PROMPT, BRANCH_INSIGHT_PROMPT, NL_TRANSLATION_PROMPT, STASH_SUMMARY_PROMPT, PR_DESCRIPTION_PROMPT } from './prompts';
import { truncateDiff, cleanCommitMessage } from './text';
import type { BranchInfo } from '../git';
import type { NlPlan, NlOperation, NlOpType } from '../../types/nl';

export function getProvider(apiKey: string): AiProvider {
  const provider = getConfiguredProvider();
  switch (provider) {
    case 'openai':
      return new OpenAiProvider(apiKey);
    case 'anthropic':
      return new AnthropicProvider(apiKey);
    case 'ollama':
      return new OllamaProvider();
    case 'tabby':
      return new TabbyProvider();
    case 'groq':
    default:
      return new GroqProvider(apiKey);
  }
}

/**
 * Generate a commit message from a diff using the configured AI provider.
 */
export async function generateCommitMessage(
  diff: string,
  apiKey: string,
  model: string
): Promise<string> {
  const providerType = getConfiguredProvider();
  const requiresApiKey = ['groq', 'openai', 'anthropic'].includes(providerType);

  if (requiresApiKey && (!apiKey || apiKey.trim().length === 0)) {
    throw new Error(`No API key set for ${providerType}. Open GitSnap Settings to add one.`);
  }

  if (!diff || diff.trim().length === 0) {
    return 'chore: update code';
  }

  const truncatedDiff = truncateDiff(diff);
  const customPrompt = getCustomSystemPrompt();
  const systemPromptToUse = customPrompt && customPrompt.trim().length > 0 ? customPrompt.trim() : SYSTEM_PROMPT;

  try {
    const provider = getProvider(apiKey);
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const rawText = await provider.generateCompletion(
          systemPromptToUse,
          `Generate a commit message for this diff:\n\n${truncatedDiff}`,
          model,
          300
        );

        const cleanedMessage = cleanCommitMessage(rawText);

        if (cleanedMessage.length === 0) {
          return 'chore: update code';
        }

        return cleanedMessage;
      } catch (attemptError) {
        lastError = attemptError instanceof Error ? attemptError : new Error(String(attemptError));
        const errMsg = lastError.message;

        // Only retry on transient errors (429, 503, rate limit, timeout, network reset)
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

/**
 * Generate a 1-sentence branch insight summary using the configured AI provider.
 * Returns null gracefully if AI is disabled or fails.
 */
export async function generateBranchInsight(
  branch: BranchInfo,
  apiKey: string,
  model: string
): Promise<string | null> {
  if (!isAiEnabled()) {
    return null;
  }

  try {
    const provider = getProvider(apiKey);
    const userPrompt = `Branch: ${branch.name}, Ahead: ${branch.ahead}, Behind: ${branch.behind}, Current: ${branch.current}, Last commit date: ${branch.lastCommitDate}, Author: ${branch.lastCommitAuthor}`;
    const rawText = await provider.generateCompletion(BRANCH_INSIGHT_PROMPT, userPrompt, model);
    return rawText.trim().replace(/^["']|["']$/g, '');
  } catch {
    return null; // Silent degradation to raw metadata
  }
}

/**
 * Extract the first JSON object or array from a raw AI response string.
 * Handles markdown fences, leading prose, and trailing text robustly.
 */
function extractJson(raw: string): string {
  // 1. Strip markdown code fences (``` or ```json)
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }

  // 2. Find the first '{' or '[' and slice from there to the matching closer
  const start = raw.search(/[{[]/);
  if (start === -1) {
    throw new SyntaxError('No JSON object found in AI response.');
  }

  // Walk forward to find the balanced closing brace/bracket
  const opener = raw[start];
  const closer = opener === '{' ? '}' : ']';
  let depth = 0;
  let end = -1;
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === opener) { depth++; }
    else if (raw[i] === closer) {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }

  if (end === -1) {
    throw new SyntaxError('Unbalanced JSON braces in AI response.');
  }

  return raw.slice(start, end + 1);
}

/**
 * Translate a natural language request into a structured Git plan.
 */
export async function translateNlCommand(
  userPrompt: string,
  apiKey: string,
  model: string
): Promise<NlPlan> {
  if (!isAiEnabled()) {
    throw new Error('AI features are disabled in GitSnap settings.');
  }

  const providerType = getConfiguredProvider();
  const requiresApiKey = ['groq', 'openai', 'anthropic'].includes(providerType);
  if (requiresApiKey && (!apiKey || apiKey.trim().length === 0)) {
    throw new Error(`No API key set for ${providerType}. Open GitSnap Settings to add one.`);
  }

  const provider = getProvider(apiKey);
  const rawResponse = await provider.generateCompletion(
    NL_TRANSLATION_PROMPT,
    `Translate request: "${userPrompt}"`,
    model,
    1000
  );

  // Extract and parse the JSON, separating parse failures from logic errors
  let parsed: any;
  try {
    const cleanJson = extractJson(rawResponse.trim());
    parsed = JSON.parse(cleanJson);
  } catch (parseErr) {
    const detail = parseErr instanceof Error ? parseErr.message : String(parseErr);
    throw new Error(
      `Failed to parse AI command plan. The model returned unexpected output. (${detail})\n\nRaw response:\n${rawResponse.slice(0, 500)}`
    );
  }

  const validOps: NlOpType[] = [
    'switchBranch',
    'createBranch',
    'deleteBranch',
    'undoLastCommit',
    'fetchAll',
    'showLog',
    'stash',
  ];

  const commands: NlOperation[] = (parsed.commands || [])
    .filter((cmd: any) => validOps.includes(cmd.op))
    .map((cmd: any) => ({
      op: cmd.op,
      args: cmd.args || {},
      description: cmd.description || `Execute ${cmd.op}`,
      requiresConfirmation: Boolean(cmd.requiresConfirmation),
    }));

  if (commands.length === 0) {
    throw new Error(
      `Could not translate "${userPrompt}" into valid Git operations. ` +
      `Try rephrasing (e.g. "switch to main", "stash my changes", "delete branch feature/x").`
    );
  }

  return { userPrompt, commands };
}

/**
 * Generate a 1-sentence summary of stash contents using AI.
 * Returns null gracefully if AI is disabled or fails.
 */
export async function generateStashSummary(
  diff: string,
  apiKey: string,
  model: string
): Promise<string | null> {
  if (!isAiEnabled() || !diff || diff.trim().length === 0) {
    return null;
  }

  try {
    const provider = getProvider(apiKey);
    const truncated = truncateDiff(diff, 5000);
    const rawText = await provider.generateCompletion(
      STASH_SUMMARY_PROMPT,
      `Summarize this stash diff:\n\n${truncated}`,
      model,
      150
    );
    return rawText.trim().replace(/^["']|["']$/g, '');
  } catch {
    return null;
  }
}

/**
 * Generate a PR title and markdown description based on commit list.
 */
export async function generatePrDescription(
  commits: string[],
  apiKey: string,
  model: string
): Promise<{ title: string; body: string }> {
  if (!isAiEnabled()) {
    throw new Error('AI features are disabled in GitSnap settings.');
  }

  const providerType = getConfiguredProvider();
  const requiresApiKey = ['groq', 'openai', 'anthropic'].includes(providerType);
  if (requiresApiKey && (!apiKey || apiKey.trim().length === 0)) {
    throw new Error(`No API key set for ${providerType}. Open GitSnap Settings to add one.`);
  }

  if (commits.length === 0) {
    return {
      title: 'Update branch',
      body: '## Summary\n\nNo commits found between branches.\n\n## Changes Made\n- N/A\n\n## Testing\n- Verified build.',
    };
  }

  const commitListStr = commits.map((c, i) => `${i + 1}. ${c}`).join('\n');
  const provider = getProvider(apiKey);
  const rawResponse = await provider.generateCompletion(
    PR_DESCRIPTION_PROMPT,
    `Generate PR description for commits:\n${commitListStr}`,
    model,
    1000
  );

  try {
    const cleanJson = extractJson(rawResponse.trim());
    const parsed = JSON.parse(cleanJson);
    return {
      title: parsed.title || commits[0] || 'Pull Request',
      body: parsed.body || `## Summary\n${commitListStr}\n\n## Testing\n- Tested build.`,
    };
  } catch (err) {
    // Graceful fallback if JSON parsing fails
    return {
      title: commits[0] || 'Pull Request',
      body: `## Summary\n\n${commitListStr}\n\n## Testing\n- Verified locally.`,
    };
  }
}

export { truncateDiff, cleanCommitMessage };