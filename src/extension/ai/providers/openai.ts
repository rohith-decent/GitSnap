import { AiProvider } from '../provider';

export class OpenAiProvider implements AiProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey || apiKey.trim().length === 0) {
      throw new Error('No API key set for OpenAI. Open GitSnap Settings to add one.');
    }
    this.apiKey = apiKey;
  }

  async generateCompletion(
    systemPrompt: string,
    userPrompt: string,
    model: string,
    maxTokens: number = 1000
  ): Promise<string> {
    const selectedModel = model && model.trim().length > 0 ? model : 'gpt-4o-mini';
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
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
      throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
    }

    const data: any = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content || content.trim().length === 0) {
      throw new Error(`OpenAI model returned an empty response (model: ${selectedModel}).`);
    }

    return content;
  }
}
