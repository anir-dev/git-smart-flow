import { getConfig, loadLocalConfig, saveGlobalConfig, saveLocalConfig } from '../config/config.js';
import type { GlobalConfig } from '../types/index.js';
import { blank, info, keyValue, section, success } from '../ux/display.js';
import { confirmPrompt, inputPrompt, selectPrompt } from '../ux/prompt.js';

export async function runConfig(): Promise<void> {
  const config = getConfig();

  section('Current Configuration');
  keyValue('Language', config.language.commit);
  keyValue('AI Provider', config.ai.provider);
  keyValue('AI Mode', config.ai.mode);
  keyValue('Max header length', String(config.commit.maxHeaderLength));
  keyValue('Block on secrets', String(config.security.blockOnSecrets));
  blank();

  const scope = await selectPrompt('Edit which configuration?', [
    'Global (~/.git-smart-flow/config.json)',
    'Local (.git-smart-flow.json in current repo)',
    'Cancel',
  ]);

  if (scope === 'Cancel') return;

  const field = await selectPrompt('Which setting?', [
    'AI provider',
    'Language',
    'Max commit header length',
    'Block on secrets',
    'Back',
  ]);

  if (field === 'Back') return;

  if (field === 'AI provider') {
    const provider = await selectPrompt('Provider:', ['heuristic', 'ollama', 'openai', 'claude', 'copilot']);
    if (scope.startsWith('Global')) {
      config.ai.provider = provider as GlobalConfig['ai']['provider'];
      saveGlobalConfig(config);
    } else {
      saveLocalConfig({ ai: { provider: provider as GlobalConfig['ai']['provider'] } });
    }
    success(`AI provider set to "${provider}".`);

  } else if (field === 'Language') {
    const lang = await selectPrompt('Language:', ['en', 'es', 'fr', 'de', 'pt']);
    if (scope.startsWith('Global')) {
      config.language.commit = lang as GlobalConfig['language']['commit'];
      config.language.prTitle = lang as GlobalConfig['language']['commit'];
      config.language.prBody = lang as GlobalConfig['language']['commit'];
      saveGlobalConfig(config);
    } else {
      info('Language is a global-only setting.');
    }
    success(`Language set to "${lang}".`);

  } else if (field === 'Max commit header length') {
    const val = await inputPrompt('Max length', String(config.commit.maxHeaderLength));
    const num = parseInt(val, 10);
    if (isNaN(num)) { info('Invalid number.'); return; }
    if (scope.startsWith('Global')) {
      config.commit.maxHeaderLength = num;
      saveGlobalConfig(config);
    } else {
      saveLocalConfig({ commit: { maxHeaderLength: num } });
    }
    success(`Max header length set to ${num}.`);

  } else if (field === 'Block on secrets') {
    const val = await selectPrompt('Block commits when secrets are detected?', ['yes', 'no']);
    const block = val === 'yes';
    if (scope.startsWith('Global')) {
      config.security.blockOnSecrets = block;
      saveGlobalConfig(config);
    } else {
      saveLocalConfig({ security: { blockOnSecrets: block } });
    }
    success(`Block on secrets: ${block}.`);
  }
}
