import type { AIContext, PRProposal, ProviderName } from '../types/index.js';
import { BaseProvider } from './base.provider.js';
import { HeuristicProvider } from './heuristic.provider.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const API_VERSION = '2023-06-01';

export class ClaudeProvider extends BaseProvider {
  name: ProviderName = 'claude';
  private apiKey: string;
  private model: string;
  private fallback = new HeuristicProvider();

  constructor(apiKey?: string, model?: string) {
    super();
    this.apiKey = apiKey ?? process.env.ANTHROPIC_API_KEY ?? '';
    this.model = model ?? DEFAULT_MODEL;
  }

  async isAvailable(): Promise<boolean> {
    return this.apiKey.length > 0;
  }

  async generateCommitMessage(context: AIContext): Promise<string> {
    if (!(await this.isAvailable())) return this.fallback.generateCommitMessage(context);
    try {
      const prompt = this.buildCommitPrompt(context);
      const response = await this.messages(prompt);
      if (response) return response.trim();
    } catch { /* */ }
    return this.fallback.generateCommitMessage(context);
  }

  async generatePRDescription(context: AIContext): Promise<PRProposal> {
    if (!(await this.isAvailable())) return this.fallback.generatePRDescription(context);
    try {
      const prompt = this.buildPRPrompt(context);
      const response = await this.messages(prompt);
      if (response) {
        const parsed = parsePRJSON(response);
        if (parsed) return parsed;
      }
    } catch { /* */ }
    return this.fallback.generatePRDescription(context);
  }

  private async messages(prompt: string): Promise<string | null> {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': API_VERSION,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      content?: Array<{ type: string; text?: string }>;
    };
    return data.content?.find((c) => c.type === 'text')?.text ?? null;
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
