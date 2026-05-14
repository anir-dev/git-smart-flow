import { strict as assert } from 'assert';
import { describe, it } from 'node:test';
import { DEFAULT_CONFIG, mergeConfigs } from '../src/config/config.js';
import type { GlobalConfig, LocalConfig } from '../src/types/index.js';

describe('config', () => {
  it('mergeConfigs returns global defaults when no local', () => {
    const merged = mergeConfigs(DEFAULT_CONFIG, null);
    assert.equal(merged.ai.provider, 'heuristic');
    assert.equal(merged.language.commit, 'en');
    assert.equal(merged._source, 'merged');
  });

  it('local config overrides global', () => {
    const local: LocalConfig = { ai: { provider: 'ollama' } };
    const merged = mergeConfigs(DEFAULT_CONFIG, local);
    assert.equal(merged.ai.provider, 'ollama');
    // Other global values preserved
    assert.equal(merged.language.commit, 'en');
  });

  it('CLI overrides take highest priority', () => {
    const local: LocalConfig = { ai: { provider: 'ollama' } };
    const cli: Partial<GlobalConfig> = { ai: { ...DEFAULT_CONFIG.ai, provider: 'claude' } };
    const merged = mergeConfigs(DEFAULT_CONFIG, local, cli);
    assert.equal(merged.ai.provider, 'claude');
  });

  it('default config has all required fields', () => {
    assert.ok(DEFAULT_CONFIG.language);
    assert.ok(DEFAULT_CONFIG.ai);
    assert.ok(DEFAULT_CONFIG.git);
    assert.ok(DEFAULT_CONFIG.commit);
    assert.ok(DEFAULT_CONFIG.security);
    assert.ok(DEFAULT_CONFIG.aliases);
  });

  it('default protected branches include main, master, develop', () => {
    assert.ok(DEFAULT_CONFIG.git.protectedBranches.includes('main'));
    assert.ok(DEFAULT_CONFIG.git.protectedBranches.includes('master'));
    assert.ok(DEFAULT_CONFIG.git.protectedBranches.includes('develop'));
  });

  it('default security blocks secrets', () => {
    assert.equal(DEFAULT_CONFIG.security.blockOnSecrets, true);
  });
});
