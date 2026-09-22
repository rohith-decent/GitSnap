import { AiProvider } from '../provider';

export class AnthropicProvider implements AiProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey || apiKey.trim().length === 0) {
      throw new Error('No API key set for Anthropic. Open GitSnap Settings to add one.');
    }
    this.apiKey = apiKey;
  }

  async generateCompletion(
    systemPrompt: string,
    userPrompt: string,
    model: string,
    maxTokens: number = 1000
  ): Promise<string> {
    const selectedModel = model && model.trim().length > 0 ? model : 'claude-3-5-haiku-20241022';
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: selectedModel,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        max_tokens: maxTokens,
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
    }

    const data: any = await response.json();
    const content = data.content?.[0]?.text;
    if (!content || content.trim().length === 0) {
      throw new Error(`Anthropic model returned an empty response (model: ${selectedModel}).`);
    }

    return content;
  }
}
