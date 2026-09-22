import { AiProvider } from '../provider';

export class OpenAiProvider implements AiProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey || apiKey.trim().length === 0) {
      throw new Error('No API key set for OpenAI. Open GitSnap Settings to add one.');
    }
    this.apiKey = apiKey;
  }

  async generateCompletion(systemPrompt: string, userPrompt: string, model: string): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 100,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
    }

    const data: any = await response.json();
    return data.choices?.[0]?.message?.content ?? '';
  }
}
