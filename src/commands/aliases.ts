import { getConfig, saveGlobalConfig } from '../config/config.js';
import type { GlobalConfig } from '../types/index.js';
import { blank, keyValue, section, success } from '../ux/display.js';
import { confirmPrompt } from '../ux/prompt.js';
import { runInstallHooks } from './install-hooks.js';

export async function runAliases(): Promise<void> {
  const config = getConfig();

  section('Aliases & Hooks');
  blank();

  const aliases: Array<[keyof GlobalConfig['aliases'], string]> = [
    ['gsfc', 'gsfc → git-smart-flow commit'],
    ['gsfm', 'gsfm → git-smart-flow merge'],
    ['gsfp', 'gsfp → git-smart-flow push'],
    ['gsfpr', 'gsfpr → git-smart-flow pr'],
    ['gsfs', 'gsfs → git-smart-flow sync'],
    ['gsfr', 'gsfr → git-smart-flow revert'],
    ['gsfb', 'gsfb → git-smart-flow branch'],
    ['gsft', 'gsft → git-smart-flow tag'],
  ];

  for (const [key, label] of aliases) {
    keyValue(label, config.aliases[key] ? 'enabled' : 'disabled');
  }
  blank();

  for (const [key, _label] of aliases) {
    const current = config.aliases[key];
    const toggle = await confirmPrompt(`${current ? 'Disable' : 'Enable'} "${key}" alias?`, false);
    if (toggle) {
      config.aliases[key] = !current;
      success(`${key} ${config.aliases[key] ? 'enabled' : 'disabled'}`);
    }
  }

  saveGlobalConfig(config);
  blank();

  const installHooksNow = await confirmPrompt(
    'Install Git hooks (commit-msg, pre-push) in current repo?',
    false
  );
  if (installHooksNow) await runInstallHooks();
}
