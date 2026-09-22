import { AiProvider } from '../provider';

export class OllamaProvider implements AiProvider {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:11434') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async generateCompletion(
    systemPrompt: string,
    userPrompt: string,
    model: string,
    _maxTokens: number = 1000
  ): Promise<string> {
    const selectedModel = model && model.trim().length > 0 ? model : 'llama3';
    const response = await fetch(`${this.baseUrl}/api/chat`, {
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
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error (${response.status}): ${errorText}`);
    }

    const data: any = await response.json();
    const content = data.message?.content;
    if (!content || content.trim().length === 0) {
      throw new Error(`Ollama model returned an empty response (model: ${selectedModel}).`);
    }

    return content;
  }
}
