import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getConfig } from '../config/config.js';
import { detectConvention } from '../git/convention-detector.js';
import {
  getAheadBehindCount,
  buildRepoContext,
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
import { isCI } from '../ux/renderer.js';
import { blank, divider, error, header, info, keyValue, section, success, warning } from '../ux/display.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

  section('Context');
  keyValue('Repository', repoName);
  keyValue('Branch', branch);
  keyValue('Convention', convention.type);
  keyValue('Commitlint', convention.hasCommitlint ? 'detected' : 'not detected');
  keyValue('AI Provider', config.ai.provider);
  blank();

  section('Status');

  if (lastCommit) {
    const msg = lastCommit.message.length > 50
      ? lastCommit.message.slice(0, 48) + '…'
      : lastCommit.message;
    keyValue('Last commit', `${lastCommit.shortSha}  "${msg}"  (${lastCommit.ago})`);
  }

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

// ── Ink-based interactive menu (TTY) ──────────────────────────────────────

async function runInkMenu(pkg: { version: string }): Promise<void> {
  const { renderInteractive } = await import('../ux/renderer.js');
  const React = (await import('react')).default;
  const { useState, useEffect } = await import('react');
  const { Select } = await import('@inkjs/ui');
  const { Box, Text } = await import('ink');
  const { theme } = await import('../ux/theme.js');
  const { StatusDashboard } = await import('../ux/components/StatusDashboard.js');

  const cwd = process.cwd();
  const config = getConfig();
  const convention = await detectConvention(cwd);
  const ctx = await buildRepoContext(
    config.git.protectedBranches,
    config.commit.ticketPattern,
    convention,
    cwd
  );
  const lastCommit = getLastCommit(cwd);
  const lastFetch = getLastFetchTime(cwd);

  const options = [
    { label: '📌  Branch manager (create, switch, delete…)', value: '1' },
    { label: '✏️   Crear commit asistido', value: '2' },
    { label: '💬  Generar mensaje de commit (sin commit)', value: '3' },
    { label: '📋  Generar descripción de PR', value: '4' },
    { label: '🔍  Validar repositorio', value: '5' },
    { label: '🚀  Push validado', value: '6' },
    { label: '🔄  Sync con remote', value: 's' },
    { label: '🔀  Merge asistido', value: '7' },
    { label: '↩️   Undo / revert wizard', value: 'u' },
    { label: '📈  Ver historial de commits', value: 'l' },
    { label: '⚙️   Configuración', value: '8' },
    { label: '🔗  Aliases & hooks', value: '9' },
    { label: '📁  Repository setup wizard', value: 'r' },
    { label: '🩺  Diagnóstico (doctor)', value: 'd' },
    { label: '❌  Salir', value: '0' },
  ];

  function MenuApp({ onSelect }: { onSelect: (val: string) => void }): JSX.Element {
    const [active, setActive] = useState(false);
    useEffect(() => { const t = setTimeout(() => setActive(true), 120); return () => clearTimeout(t); }, []);
    return React.createElement(Box, { flexDirection: 'column', paddingX: 1 },
      React.createElement(StatusDashboard, {
        ctx,
        lastCommit,
        lastFetch,
        version: pkg.version,
        provider: config.ai.provider,
        cwd,
        graphLimit: 3,
      }),
      React.createElement(Box, { flexDirection: 'column', borderStyle: 'round', borderColor: theme.border, paddingX: 1, marginBottom: 1 },
        React.createElement(Text, { bold: true, color: theme.muted }, '¿Qué quieres hacer?'),
        React.createElement(Text, { color: theme.muted }, ''),
        React.createElement(Select, { isDisabled: !active, options, onChange: onSelect })
      ),
      React.createElement(Text, { color: theme.muted }, '  ↑↓ navegar   Enter seleccionar')
    );
  }

  const choice = await renderInteractive<string>((resolve) =>
    React.createElement(MenuApp, { onSelect: resolve }) as JSX.Element
  );

  await handleChoice(choice);
}

async function handleChoice(choice: string): Promise<void> {
  switch (choice) {
    case '1': { const { runBranch } = await import('./branch.js'); await runBranch(); break; }
    case '2': { const { runCommit } = await import('./commit.js'); await runCommit(); break; }
    case '3': { const { runCommitMessage } = await import('./commit-message.js'); await runCommitMessage({}); break; }
    case '4': { const { runPR } = await import('./pr.js'); await runPR(); break; }
    case '5': { const { runValidate } = await import('./validate.js'); await runValidate(); break; }
    case '6': { const { runPush } = await import('./push.js'); await runPush(); break; }
    case 's': { const { runSync } = await import('./sync.js'); await runSync(); break; }
    case '7': { const { runMerge } = await import('./merge.js'); await runMerge(); break; }
    case 'u': { const { runRevert } = await import('./revert.js'); await runRevert(); break; }
    case 'l': { const { runLog } = await import('./log.js'); await runLog(); break; }
    case '8': { const { runConfig } = await import('./config.js'); await runConfig(); break; }
    case '9': { const { runAliases } = await import('./aliases.js'); await runAliases(); break; }
    case 'r': { const { runRepoInit } = await import('./repo-init.js'); await runRepoInit(); break; }
    case 'd': { const { runDoctor } = await import('./doctor.js'); await runDoctor(); break; }
    case '0': process.exit(0); break;
    default: info('Unknown option.'); break;
  }
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
}

// ── CI / plain menu ────────────────────────────────────────────────────────

async function runPlainMenu(pkg: { version: string }): Promise<void> {
  header('', pkg.version);
  const cwd = process.cwd();
  if (isGitRepo(cwd)) {
    await printStatus(cwd);
  } else {
    info('Not a Git repository.');
    blank();
  }
  await showHelp();
}

// ── Entry point ────────────────────────────────────────────────────────────

export async function runMenu(): Promise<void> {
  const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8')) as { version: string };

  if (isCI()) {
    await runPlainMenu(pkg);
    return;
  }

  // Loop: after each action the menu re-renders with fresh repo data
  while (true) {
    await runInkMenu(pkg);
  }
}
