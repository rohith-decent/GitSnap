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

  async generateCompletion(systemPrompt: string, userPrompt: string, model: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: model || 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 100,
    });

    return response.choices[0]?.message?.content ?? '';
  }
}
