import { getConfiguredProvider, isAiEnabled } from './config';
import { AiProvider } from './provider';
import { GroqProvider } from './providers/groq';
import { OpenAiProvider } from './providers/openai';
import { AnthropicProvider } from './providers/anthropic';
import { OllamaProvider } from './providers/ollama';
import { TabbyProvider } from './providers/tabby';
import { SYSTEM_PROMPT, BRANCH_INSIGHT_PROMPT, NL_TRANSLATION_PROMPT } from './prompts';
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

  try {
    const provider = getProvider(apiKey);
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const rawText = await provider.generateCompletion(
          SYSTEM_PROMPT,
          `Generate a commit message for this diff:\n\n${truncatedDiff}`,
          model
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
    model
  );

  let cleanJson = rawResponse.trim();
  if (cleanJson.startsWith('```')) {
    cleanJson = cleanJson.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  try {
    const parsed = JSON.parse(cleanJson);
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
      throw new Error('Could not translate request into valid Git operations.');
    }

    return { userPrompt, commands };
  } catch (err) {
    if (err instanceof Error && err.message.includes('Could not translate')) {
      throw err;
    }
    throw new Error('Failed to parse AI command plan.');
  }
}

export { truncateDiff, cleanCommitMessage };