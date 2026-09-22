export interface AiProvider {
  generateCompletion(systemPrompt: string, userPrompt: string, model: string): Promise<string>;
}
