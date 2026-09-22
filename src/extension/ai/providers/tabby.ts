import { AiProvider } from '../provider';

export class TabbyProvider implements AiProvider {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:8080') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async generateCompletion(systemPrompt: string, userPrompt: string, model: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model || 'tabby',
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
      throw new Error(`Tabby API error (${response.status}): ${errorText}`);
    }

    const data: any = await response.json();
    return data.choices?.[0]?.message?.content ?? '';
  }
}
