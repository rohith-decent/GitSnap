import Groq from 'groq-sdk';
import { AiProvider } from '../provider';

export class GroqProvider implements AiProvider {
  private client: Groq;

  constructor(apiKey: string) {
    if (!apiKey || apiKey.trim().length === 0) {
      throw new Error('No API key set for Groq. Open GitSnap Settings to add one.');
    }
    this.client = new Groq({ apiKey });
  }

  async generateCompletion(
    systemPrompt: string,
    userPrompt: string,
    model: string,
    maxTokens: number = 1000
  ): Promise<string> {
    const selectedModel = model && model.trim().length > 0 ? model : 'llama-3.3-70b-versatile';
    const response = await this.client.chat.completions.create({
      model: selectedModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: maxTokens,
    });

    const content = response.choices[0]?.message?.content;
    if (!content || content.trim().length === 0) {
      const finishReason = response.choices[0]?.finish_reason ?? 'unknown';
      throw new Error(`Groq AI returned an empty response (finish_reason: ${finishReason}, model: ${selectedModel}).`);
    }

    return content;
  }
}
