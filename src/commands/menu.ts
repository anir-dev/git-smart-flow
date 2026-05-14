import { readFileSync } from 'fs';
import { join } from 'path';
import { getConfig } from '../config/config.js';
import { detectConvention } from '../git/convention-detector.js';
import {
  getAheadBehindCount,
  getCurrentBranch,
  getLastCommit,
  getLastFetchTime,
  getRepoName,
  getStagedFiles,
  getUnstagedFiles,
  getUntrackedFiles,
  getUpstream,
  hasMergeConflicts,
  isGitRepo,
} from '../git/repo.js';
import { blank, divider, error, header, info, keyValue, section, success, warning } from '../ux/display.js';
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
import { runRevert } from './revert.js';
import { runSync } from './sync.js';

// ── Relative time helper ───────────────────────────────────────────────────

function relativeTime(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ── Status panel ───────────────────────────────────────────────────────────

async function printStatus(cwd: string): Promise<void> {
  const config = getConfig();
  const convention = await detectConvention(cwd);
  const branch = getCurrentBranch(cwd);
  const repoName = getRepoName(cwd);
  const upstream = getUpstream(cwd);
  const lastCommit = getLastCommit(cwd);
  const staged = getStagedFiles(cwd);
  const modified = getUnstagedFiles(cwd);
  const untracked = getUntrackedFiles(cwd);
  const conflicts = hasMergeConflicts(cwd);
  const lastFetch = getLastFetchTime(cwd);
  const { ahead, behind } = upstream
    ? getAheadBehindCount(upstream, cwd)
    : { ahead: 0, behind: 0 };

  // ── Context (original section — always shown) ──
  section('Context');
  keyValue('Repository', repoName);
  keyValue('Branch', branch);
  keyValue('Convention', convention.type);
  keyValue('Commitlint', convention.hasCommitlint ? 'detected' : 'not detected');
  keyValue('AI Provider', config.ai.provider);
  blank();

  // ── Status (new section — live repo state) ──
  section('Status');

  // Last commit
  if (lastCommit) {
    const msg = lastCommit.message.length > 50
      ? lastCommit.message.slice(0, 48) + '…'
      : lastCommit.message;
    keyValue('Last commit', `${lastCommit.shortSha}  "${msg}"  (${lastCommit.ago})`);
  }

  // Remote sync
  if (upstream) {
    const parts: string[] = [];
    if (ahead > 0)  parts.push(`↑ ${ahead} to push`);
    if (behind > 0) parts.push(`↓ ${behind} to pull`);
    if (parts.length === 0) parts.push('in sync ✔');
    const fetchNote = lastFetch ? `fetched ${relativeTime(lastFetch)}` : 'never fetched';
    const syncStr = `${upstream}  ·  ${parts.join('  ')}  ·  ${fetchNote}`;
    if (behind > 0 || conflicts) warning(`Remote: ${syncStr}`);
    else if (ahead > 0) keyValue('Remote', syncStr);
    else success(`Remote: ${syncStr}`);
  } else {
    info('Remote: no upstream configured  →  option r');
  }

  // Working tree
  const hasChanges = staged.length > 0 || modified.length > 0 || untracked.length > 0 || conflicts;
  if (hasChanges) {
    const parts: string[] = [];
    if (staged.length > 0)    parts.push(`● ${staged.length} staged`);
    if (modified.length > 0)  parts.push(`△ ${modified.length} modified`);
    if (untracked.length > 0) parts.push(`○ ${untracked.length} untracked`);
    if (conflicts)            parts.push('✖ CONFLICTS');
    const line = parts.join('  ·  ');
    if (conflicts)                                    error(`Working tree: ${line}`);
    else if (staged.length > 0 || modified.length > 0) warning(`Working tree: ${line}`);
    else                                              keyValue('Working tree', line);
  } else {
    success('Working tree: clean');
  }

  // Actionable hints
  const hints: string[] = [];
  if (conflicts)          hints.push('✖ Conflicts detected → option 7 (merge) or u (undo)');
  if (staged.length > 0) hints.push(`● ${staged.length} staged → option 2 to commit`);
  else if (modified.length > 0 || untracked.length > 0)
                          hints.push(`△ ${modified.length + untracked.length} file(s) changed → option 2 to commit`);
  if (ahead > 0)          hints.push(`↑ ${ahead} commit(s) to push → option 6`);
  if (behind > 0)         hints.push(`↓ ${behind} commit(s) from remote → option s to sync`);

  if (hints.length > 0) {
    blank();
    hints.forEach((h) => console.log(`  ${h}`));
  }

  blank();
}

// ── Help screen ────────────────────────────────────────────────────────────

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
    ['gsf sync',           'Fetch + sync status + pull/merge/conflict guide'],
    ['gsf merge',          'Assisted merge with conflict handling'],
    ['gsf revert',         'Undo / revert wizard (remove files, reset commits…)'],
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

// ── Main menu ──────────────────────────────────────────────────────────────

export async function runMenu(): Promise<void> {
  const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8')) as { version: string };
  header('', pkg.version);

  const cwd = process.cwd();

  if (isGitRepo(cwd)) {
    await printStatus(cwd);
  } else {
    info('Not a Git repository — run option r to initialize one.');
    blank();
  }

  await showMenu('What do you want to do?', [
    { key: '1', label: 'Branch manager (create, switch, delete…)', action: runBranch },
    { key: '2', label: 'Guided commit assistant',                   action: runCommit },
    { key: '3', label: 'Generate commit message (no commit)',       action: () => runCommitMessage({}) },
    { key: '4', label: 'Generate PR description',                   action: runPR },
    { key: '5', label: 'Validate repository',                       action: runValidate },
    { key: '6', label: 'Push (validated)',                          action: runPush },
    { key: 's', label: 'Sync with remote (fetch + pull + conflicts)',action: runSync },
    { key: '7', label: 'Merge assistant',                           action: runMerge },
    { key: 'u', label: 'Undo / revert wizard',                      action: runRevert },
    { key: '8', label: 'Configuration',                             action: runConfig },
    { key: '9', label: 'Aliases & hooks',                           action: runAliases },
    { key: 'r', label: 'Repository setup wizard',                   action: runRepoInit },
    { key: 'd', label: 'Diagnostic (doctor)',                       action: runDoctor },
    { key: 'h', label: 'Help — show all CLI commands',              action: showHelp },
    { key: '0', label: 'Exit',                                      action: async () => process.exit(0) },
  ]);
}
