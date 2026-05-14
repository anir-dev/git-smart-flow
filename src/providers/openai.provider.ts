import type { AIContext, PRProposal, ProviderName } from '../types/index.js';
import { BaseProvider } from './base.provider.js';
import { HeuristicProvider } from './heuristic.provider.js';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';

export class OpenAIProvider extends BaseProvider {
  name: ProviderName = 'openai';
  private apiKey: string;
  private model: string;
  private fallback = new HeuristicProvider();

  constructor(apiKey?: string, model?: string) {
    super();
    this.apiKey = apiKey ?? process.env.OPENAI_API_KEY ?? '';
    this.model = model ?? DEFAULT_MODEL;
  }

  async isAvailable(): Promise<boolean> {
    return this.apiKey.length > 0;
  }

  async generateCommitMessage(context: AIContext): Promise<string> {
    if (!(await this.isAvailable())) return this.fallback.generateCommitMessage(context);
    try {
      const prompt = this.buildCommitPrompt(context);
      const response = await this.chat(prompt);
      if (response) return response.trim();
    } catch { /* */ }
    return this.fallback.generateCommitMessage(context);
  }

  async generatePRDescription(context: AIContext): Promise<PRProposal> {
    if (!(await this.isAvailable())) return this.fallback.generatePRDescription(context);
    try {
      const prompt = this.buildPRPrompt(context);
      const response = await this.chat(prompt);
      if (response) {
        const parsed = parsePRJSON(response);
        if (parsed) return parsed;
      }
    } catch { /* */ }
    return this.fallback.generatePRDescription(context);
  }

  private async chat(prompt: string): Promise<string | null> {
    const res = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 512,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? null;
  }
}

function parsePRJSON(raw: string): PRProposal | null {
  try {
    const match = raw.match(/\{[\s\S]+\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as { title?: string; body?: string };
    if (parsed.title && parsed.body) return { title: parsed.title, body: parsed.body };
  } catch { /* */ }
  return null;
}
