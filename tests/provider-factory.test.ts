import { strict as assert } from 'assert';
import { describe, it } from 'node:test';
import { createProvider } from '../src/providers/provider.factory.js';
import { DEFAULT_CONFIG, mergeConfigs } from '../src/config/config.js';
import { HeuristicProvider } from '../src/providers/heuristic.provider.js';
import { OllamaProvider } from '../src/providers/ollama.provider.js';
import { OpenAIProvider } from '../src/providers/openai.provider.js';
import { ClaudeProvider } from '../src/providers/claude.provider.js';

function makeConfig(overrides: Partial<(typeof DEFAULT_CONFIG)['ai']>) {
  return mergeConfigs(DEFAULT_CONFIG, null, {
    ai: { ...DEFAULT_CONFIG.ai, ...overrides },
  });
}

describe('provider-factory', () => {
  it('returns HeuristicProvider when provider is heuristic', () => {
    const config = makeConfig({ provider: 'heuristic' });
    const provider = createProvider(config);
    assert.ok(provider instanceof HeuristicProvider);
  });

  it('returns HeuristicProvider when AI is disabled', () => {
    const config = makeConfig({ provider: 'openai', enabled: false });
    const provider = createProvider(config);
    assert.ok(provider instanceof HeuristicProvider);
  });

  it('returns OllamaProvider when provider is ollama', () => {
    const config = makeConfig({ provider: 'ollama' });
    const provider = createProvider(config);
    assert.ok(provider instanceof OllamaProvider);
  });

  it('returns OpenAIProvider when provider is openai', () => {
    const config = makeConfig({ provider: 'openai', apiKey: 'sk-test' });
    const provider = createProvider(config);
    assert.ok(provider instanceof OpenAIProvider);
  });

  it('returns ClaudeProvider when provider is claude', () => {
    const config = makeConfig({ provider: 'claude', apiKey: 'sk-ant-test' });
    const provider = createProvider(config);
    assert.ok(provider instanceof ClaudeProvider);
  });

  it('HeuristicProvider is always available', async () => {
    const config = makeConfig({ provider: 'heuristic' });
    const provider = createProvider(config);
    assert.equal(await provider.isAvailable(), true);
  });
});
