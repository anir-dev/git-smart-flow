import { readFileSync } from 'fs';
import { join } from 'path';
import { getConfig } from '../config/config.js';
import { detectConvention } from '../git/convention-detector.js';
import { getCurrentBranch, getRepoName, isGitRepo } from '../git/repo.js';
import { blank, divider, header, keyValue, section } from '../ux/display.js';
import { showMenu } from '../ux/menu.js';
import { runBranch } from './branch.js';
import { runCommit } from './commit.js';
import { runCommitMessage } from './commit-message.js';
import { runConfig } from './config.js';
import { runDoctor } from './doctor.js';
import { runMerge } from './merge.js';
import { runPR } from './pr.js';
import { runPush } from './push.js';
import { runValidate } from './validate.js';
import { runAliases } from './aliases.js';
import { runRepoInit } from './repo-init.js';

async function showHelp(): Promise<void> {
  blank();
  section('Available Commands');
  const commands: [string, string][] = [
    ['gsf',                'Open interactive menu (default)'],
    ['gsf setup',          'Interactive setup wizard'],
    ['gsf branch',         'Branch manager: create, switch, list, delete, rename'],
    ['gsf commit',         'Guided commit assistant'],
    ['gsf commit-message', 'Generate commit message without committing'],
    ['gsf pr',             'Generate PR title and description'],
    ['gsf validate',       'Validate repository state'],
    ['gsf push',           'Validated push with confirmation'],
    ['gsf merge',          'Assisted merge with conflict handling'],
    ['gsf config',         'Edit global and local configuration'],
    ['gsf aliases',        'Manage optional command aliases and hooks'],
    ['gsf install-hooks',  'Install Git hooks in .git/hooks/'],
    ['gsf repo-init',      'Repository setup wizard (branch, identity, .gitignore, remote, hooks)'],
    ['gsf info',           'Show current repository context'],
    ['gsf doctor',         'Full environment diagnostic'],
  ];
  for (const [cmd, desc] of commands) {
    console.log(`  ${cmd.padEnd(24)}  ${desc}`);
  }
  blank();
  console.log('  Flags available on some commands:');
  console.log('    --no-ai        Force heuristic provider (no AI)');
  console.log('    --show-prompt  Show AI prompt before sending');
  console.log('    --output-only  Print result to stdout only');
  blank();
}

export async function runMenu(): Promise<void> {
  const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8')) as { version: string };
  header('', pkg.version);

  const cwd = process.cwd();
  const config = getConfig();

  if (isGitRepo(cwd)) {
    const convention = await detectConvention(cwd);
    const branch = getCurrentBranch(cwd);
    const repoName = getRepoName(cwd);
    section('Context');
    keyValue('Repository', repoName);
    keyValue('Branch', branch);
    keyValue('Convention', convention.type);
    keyValue('Commitlint', convention.hasCommitlint ? 'detected' : 'not detected');
    keyValue('AI Provider', config.ai.provider);
    blank();
  }

  await showMenu('What do you want to do?', [
    { key: '1', label: 'Branch manager (create, switch, delete…)', action: runBranch },
    { key: '2', label: 'Guided commit assistant',                   action: runCommit },
    { key: '3', label: 'Generate commit message (no commit)',       action: () => runCommitMessage({}) },
    { key: '4', label: 'Generate PR description',                   action: runPR },
    { key: '5', label: 'Validate repository',                       action: runValidate },
    { key: '6', label: 'Push (validated)',                          action: runPush },
    { key: '7', label: 'Merge assistant',                           action: runMerge },
    { key: '8', label: 'Configuration',                             action: runConfig },
    { key: '9', label: 'Aliases & hooks',                           action: runAliases },
    { key: 'r', label: 'Repository setup wizard',                   action: runRepoInit },
    { key: 'd', label: 'Diagnostic (doctor)',                       action: runDoctor },
    { key: 'h', label: 'Help — show all CLI commands',              action: showHelp },
    { key: '0', label: 'Exit',                                      action: async () => process.exit(0) },
  ]);
}
