import type { AIProvider, MergedConfig, ProviderName } from '../types/index.js';
import { ClaudeProvider } from './claude.provider.js';
import { CopilotProvider } from './copilot.provider.js';
import { HeuristicProvider } from './heuristic.provider.js';
import { OllamaProvider } from './ollama.provider.js';
import { OpenAIProvider } from './openai.provider.js';

export function createProvider(config: MergedConfig): AIProvider {
  if (!config.ai.enabled) return new HeuristicProvider();

  const provider = buildProvider(config.ai.provider, config);
  return provider;
}

function buildProvider(name: ProviderName, config: MergedConfig): AIProvider {
  switch (name) {
    case 'openai':
      return new OpenAIProvider(config.ai.apiKey, config.ai.model);
    case 'claude':
      return new ClaudeProvider(config.ai.apiKey, config.ai.model);
    case 'ollama':
      return new OllamaProvider(config.ai.ollamaUrl, config.ai.ollamaModel);
    case 'copilot':
      return new CopilotProvider(config.ai.copilotCommand);
    case 'heuristic':
    default:
      return new HeuristicProvider();
  }
}

export async function createProviderWithFallback(config: MergedConfig): Promise<AIProvider> {
  const primary = createProvider(config);
  if (await primary.isAvailable()) return primary;

  // Auto-detect Ollama if primary is unavailable
  const ollama = new OllamaProvider(config.ai.ollamaUrl, config.ai.ollamaModel);
  if (await ollama.isAvailable()) return ollama;

  return new HeuristicProvider();
}

export async function detectAvailableProviders(): Promise<ProviderName[]> {
  const available: ProviderName[] = ['heuristic'];

  const ollama = new OllamaProvider();
  if (await ollama.isAvailable()) available.push('ollama');

  const copilot = new CopilotProvider();
  if (await copilot.isAvailable()) available.push('copilot');

  if (process.env.OPENAI_API_KEY) available.push('openai');
  if (process.env.ANTHROPIC_API_KEY) available.push('claude');

  return available;
}
