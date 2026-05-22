import { spawnSync } from 'child_process';
import type { AIContext, PRProposal, ProviderName } from '../types/index.js';
import { BaseProvider } from './base.provider.js';
import { HeuristicProvider } from './heuristic.provider.js';

const COPILOT_CANDIDATES = ['gh copilot suggest', 'copilot'];

export class CopilotProvider extends BaseProvider {
  name: ProviderName = 'copilot';
  private command: string;
  private fallback = new HeuristicProvider();

  constructor(command?: string) {
    super();
    this.command = command ?? '';
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async isAvailable(): Promise<boolean> {
    if (this.command) return testCommand(this.command);
    for (const candidate of COPILOT_CANDIDATES) {
      if (testCommand(candidate)) {
        this.command = candidate;
        return true;
      }
    }
    return false;
  }

  async generateCommitMessage(context: AIContext): Promise<string> {
    if (!(await this.isAvailable())) {
      return this.fallback.generateCommitMessage(context);
    }
    try {
      const prompt = this.buildCommitPrompt(context);
      const result = runCopilot(this.command, prompt);
      if (result) return result.trim();
    } catch {
      /* */
    }
    return this.fallback.generateCommitMessage(context);
  }

  async generatePRDescription(context: AIContext): Promise<PRProposal> {
    if (!(await this.isAvailable())) {
      return this.fallback.generatePRDescription(context);
    }
    try {
      const prompt = this.buildPRPrompt(context);
      const result = runCopilot(this.command, prompt);
      if (result) return parsePRJSON(result) ?? this.fallback.generatePRDescription(context);
    } catch {
      /* */
    }
    return this.fallback.generatePRDescription(context);
  }
}

function testCommand(cmd: string): boolean {
  const parts = cmd.split(' ');
  const result = spawnSync(parts[0] ?? cmd, [...parts.slice(1), '--version'], {
    encoding: 'utf-8',
    timeout: 3000,
  });
  return result.status === 0;
}

function runCopilot(cmd: string, prompt: string): string | null {
  const parts = cmd.split(' ');
  const result = spawnSync(parts[0] ?? cmd, [...parts.slice(1), '-t', 'shell', prompt], {
    encoding: 'utf-8',
    timeout: 30000,
  });
  if (result.status !== 0) return null;
  return result.stdout?.trim() ?? null;
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
