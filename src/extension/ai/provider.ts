export interface AiProvider {
  generateCompletion(systemPrompt: string, userPrompt: string, model: string, maxTokens?: number): Promise<string>;
}
