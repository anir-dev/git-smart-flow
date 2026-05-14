import { execSync, spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getConfig, globalConfigExists } from '../config/config.js';
import { detectConvention } from '../git/convention-detector.js';
import { isGitRepo } from '../git/repo.js';
import { detectAvailableProviders } from '../providers/provider.factory.js';
import { blank, divider, error, info, keyValue, section, success, warning } from '../ux/display.js';

export async function runDoctor(): Promise<void> {
  const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8')) as { version: string };
  section('Environment Diagnostic');

  // Node.js
  const nodeVersion = process.version;
  const nodeOk = parseInt(nodeVersion.slice(1), 10) >= 18;
  nodeOk ? success(`Node.js ${nodeVersion}`) : error(`Node.js ${nodeVersion} — requires >= 18`);

  // Git
  const gitResult = spawnSync('git', ['--version'], { encoding: 'utf-8' });
  if (gitResult.status === 0) {
    success(gitResult.stdout.trim());
  } else {
    error('Git not found — install Git to use this tool');
  }

  // git-smart-flow version
  info(`git-smart-flow v${pkg.version}`);

  blank();
  section('Configuration');

  if (globalConfigExists()) {
    success('Global config found (~/.git-smart-flow/config.json)');
    const config = getConfig();
    keyValue('AI Provider', config.ai.provider, 2);
    keyValue('Language', config.language.commit, 2);
  } else {
    warning('No global config — run "git-smart-flow setup" to create one');
  }

  blank();
  section('Repository');

  const cwd = process.cwd();
  if (isGitRepo(cwd)) {
    success('Inside a Git repository');
    const convention = await detectConvention(cwd);
    keyValue('Convention', convention.type, 2);
    keyValue('Commitlint', convention.hasCommitlint ? 'detected' : 'not detected', 2);
    keyValue('Husky', convention.hasHusky ? 'detected' : 'not detected', 2);
  } else {
    info('Not inside a Git repository');
  }

  blank();
  section('AI Providers');

  const available = await detectAvailableProviders();
  const allProviders = ['heuristic', 'ollama', 'copilot', 'openai', 'claude'] as const;
  for (const p of allProviders) {
    if (available.includes(p)) {
      success(`${p} — available`);
    } else {
      info(`${p} — not available`);
    }
  }

  blank();
  divider();
}
