import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { saveGlobalConfig, DEFAULT_CONFIG } from '../config/config.js';
import { detectAvailableProviders } from '../providers/provider.factory.js';
import type { GlobalConfig, ProviderName } from '../types/index.js';
import {
  blank,
  divider,
  header,
  info,
  keyValue,
  section,
  success,
  warning,
} from '../ux/display.js';
import { inputPrompt, passwordPrompt, selectPrompt } from '../ux/prompt.js';
import { startSpinner, succeedSpinner } from '../ux/spinner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROVIDER_LABELS: Record<ProviderName, string> = {
  heuristic: 'None — heuristic only (always works, no AI)',
  ollama: 'Ollama local (free, private, no internet required)',
  copilot: 'GitHub Copilot CLI',
  openai: 'OpenAI API (requires API key)',
  claude: 'Claude API — Anthropic (requires API key)',
};

export async function runSetup(): Promise<void> {
  const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8')) as {
    version: string;
  };
  header('Interactive Setup Wizard', pkg.version);

  // Prerequisites
  section('Prerequisites');
  const nodeOk = parseInt(process.version.slice(1), 10) >= 18;
  if (nodeOk) {
    success(`Node.js ${process.version}`);
  } else {
    warning(`Node.js ${process.version} — requires >= 18`);
  }
  success('Git: checking...');

  blank();

  // Detect available AI providers
  startSpinner('Detecting available AI providers...');
  const available = await detectAvailableProviders();
  succeedSpinner();

  section('Detected Providers');
  for (const p of ['heuristic', 'ollama', 'copilot', 'openai', 'claude'] as ProviderName[]) {
    const label = available.includes(p) ? '✔' : '○';
    console.log(`  ${label} ${p}`);
  }
  blank();

  const config: GlobalConfig = { ...DEFAULT_CONFIG };

  // Language
  section('Language');
  const lang = await selectPrompt('Default language for commits and PR descriptions:', [
    'en (English)',
    'es (Spanish)',
    'fr (French)',
    'de (German)',
    'pt (Portuguese)',
  ]);
  const langCode = lang.split(' ')[0] as GlobalConfig['language']['commit'];
  config.language.commit = langCode;
  config.language.prTitle = langCode;
  config.language.prBody = langCode;

  // AI Provider
  section('AI Provider');
  const providerChoices = (
    ['heuristic', 'ollama', 'copilot', 'openai', 'claude'] as ProviderName[]
  ).map((p) => {
    const avail = available.includes(p) ? ' [available]' : '';
    return `${p}${avail} — ${PROVIDER_LABELS[p]}`;
  });

  const providerChoice = await selectPrompt(
    'Which AI provider do you want to use?',
    providerChoices
  );
  const chosenProvider = providerChoice.split(' ')[0] as ProviderName;
  config.ai.provider = chosenProvider;

  if (chosenProvider === 'openai') {
    config.ai.apiKey = await passwordPrompt('OpenAI API Key');
  } else if (chosenProvider === 'claude') {
    config.ai.apiKey = await passwordPrompt('Anthropic API Key');
  } else if (chosenProvider === 'ollama') {
    const model = await inputPrompt('Ollama model', 'llama3.2');
    config.ai.ollamaModel = model;
  }

  // Save config
  saveGlobalConfig(config);

  blank();
  section('Setup Complete');
  keyValue('Language', config.language.commit);
  keyValue('AI Provider', config.ai.provider);
  blank();
  success('Configuration saved to ~/.git-smart-flow/config.json');
  info('Run "git-smart-flow menu" or just "gsf" to open the main menu.');
  divider();
}
