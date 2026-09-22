import { AiProvider } from '../provider';

export class TabbyProvider implements AiProvider {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:8080') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async generateCompletion(
    systemPrompt: string,
    userPrompt: string,
    model: string,
    maxTokens: number = 1000
  ): Promise<string> {
    const selectedModel = model && model.trim().length > 0 ? model : 'tabby';
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Tabby API error (${response.status}): ${errorText}`);
    }

    const data: any = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content || content.trim().length === 0) {
      throw new Error(`Tabby model returned an empty response (model: ${selectedModel}).`);
    }

    return content;
  }
}
