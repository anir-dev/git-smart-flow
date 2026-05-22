import type { AIContext, PRProposal, ProviderName } from '../types/index.js';
import { BaseProvider } from './base.provider.js';
import { HeuristicProvider } from './heuristic.provider.js';

const DEFAULT_OLLAMA_URL = 'http://localhost:11434';
const DEFAULT_MODEL = 'llama3.2';
const OLLAMA_GENERATE_PATH = '/api/generate';

export class OllamaProvider extends BaseProvider {
  name: ProviderName = 'ollama';
  private baseUrl: string;
  private model: string;
  private fallback = new HeuristicProvider();

  constructor(baseUrl?: string, model?: string) {
    super();
    this.baseUrl = baseUrl ?? DEFAULT_OLLAMA_URL;
    this.model = model ?? DEFAULT_MODEL;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(2000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  async generateCommitMessage(context: AIContext): Promise<string> {
    if (!(await this.isAvailable())) return this.fallback.generateCommitMessage(context);
    try {
      const prompt = this.buildCommitPrompt(context);
      const response = await this.generate(prompt);
      if (response) return response.trim();
    } catch {
      /* */
    }
    return this.fallback.generateCommitMessage(context);
  }

  async generatePRDescription(context: AIContext): Promise<PRProposal> {
    if (!(await this.isAvailable())) return this.fallback.generatePRDescription(context);
    try {
      const prompt = this.buildPRPrompt(context);
      const response = await this.generate(prompt);
      if (response) {
        const parsed = parsePRJSON(response);
        if (parsed) return parsed;
      }
    } catch {
      /* */
    }
    return this.fallback.generatePRDescription(context);
  }

  private async generate(prompt: string): Promise<string | null> {
    const res = await fetch(`${this.baseUrl}${OLLAMA_GENERATE_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, prompt, stream: false }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { response?: string };
    return data.response ?? null;
  }
}

function parsePRJSON(raw: string): PRProposal | null {
  try {
    const match = raw.match(/\{[\s\S]+\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as { title?: string; body?: string };
    if (parsed.title && parsed.body) return { title: parsed.title, body: parsed.body };
  } catch {
    /* */
  }
  return null;
}
