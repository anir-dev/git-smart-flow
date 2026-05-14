import { execSync } from 'child_process';
import { getConfig } from '../config/config.js';
import { buildAIContext } from '../git/ai-context-builder.js';
import { detectConvention } from '../git/convention-detector.js';
import { ensureGitRepo } from '../git/ensure-repo.js';
import {
  extractTicketFromBranch,
  getCurrentBranch,
  getRepoName,
  getStagedFiles,
  getUnstagedFiles,
  getUntrackedFiles,
  isProtectedBranch,
  stageFiles,
  unstageAll,
} from '../git/repo.js';
import { scanFiles } from '../security/scanner.js';
import { createProviderWithFallback } from '../providers/provider.factory.js';
import { blank, error, info, keyValue, section, success, warning } from '../ux/display.js';
import { confirmPrompt, inputPrompt, selectPrompt, smartFileSelectPrompt } from '../ux/prompt.js';
import { failSpinner, startSpinner, succeedSpinner } from '../ux/spinner.js';

// ── Conventional commit types ──────────────────────────────────────────────

const TYPE_OPTIONS = [
  { type: 'feat',     label: 'feat      — new feature or enhancement' },
  { type: 'fix',      label: 'fix       — bug fix' },
  { type: 'docs',     label: 'docs      — documentation only' },
  { type: 'style',    label: 'style     — formatting, no logic change' },
  { type: 'refactor', label: 'refactor  — code restructuring, no feature/fix' },
  { type: 'test',     label: 'test      — adding or correcting tests' },
  { type: 'chore',    label: 'chore     — maintenance, tooling, dependencies' },
  { type: 'ci',       label: 'ci        — CI/CD configuration' },
  { type: 'perf',     label: 'perf      — performance improvement' },
  { type: 'build',    label: 'build     — build system or external deps' },
  { type: 'revert',   label: 'revert    — revert a previous commit' },
];

function parseConventionalMessage(msg: string): { type: string; scope: string; desc: string; body: string; breaking: boolean } {
  const match = msg.match(/^(\w+)(?:\(([^)]*)\))?(!)?\s*:\s*(.+)/);
  if (match) {
    const [, type, scope = '', excl, desc] = match;
    const lines = msg.split('\n');
    const body = lines.slice(1).join('\n').replace(/BREAKING CHANGE:.*/gs, '').trim();
    return {
      type,
      scope,
      desc: desc.trim(),
      body,
      breaking: !!excl || /BREAKING CHANGE:/m.test(msg),
    };
  }
  return { type: 'feat', scope: '', desc: msg.trim(), body: '', breaking: false };
}

export async function guidedMessageBuilder(current?: string): Promise<string | null> {
  section('Commit Message Builder');
  const pre = current ? parseConventionalMessage(current) : { type: 'feat', scope: '', desc: '', body: '', breaking: false };

  // Type
  const defaultTypeIdx = TYPE_OPTIONS.findIndex((t) => t.type === pre.type);
  const typeLabels = TYPE_OPTIONS.map((t) => t.label);
  const typeChoice = await selectPrompt('Commit type:', typeLabels);
  const matchedType = TYPE_OPTIONS.find((t) => typeChoice.startsWith(t.type));
  const type = matchedType?.type ?? pre.type;

  // Scope
  const scope = await inputPrompt('Scope (optional — e.g. "auth", "api", "parser")', pre.scope || undefined);

  // Short description
  const desc = await inputPrompt('Short description (imperative — e.g. "add login page")', pre.desc || undefined);
  if (!desc.trim()) { info('Cancelled — no description provided.'); return null; }

  // Body
  const body = await inputPrompt('Body (optional — press Enter to skip)', pre.body || undefined);

  // Breaking change
  const isBreaking = await confirmPrompt('Is this a breaking change?', false);
  let breakingNote = '';
  if (isBreaking) {
    breakingNote = await inputPrompt('Describe the breaking change (will appear as BREAKING CHANGE footer)');
  }

  // Assemble
  const header = `${type}${scope.trim() ? `(${scope.trim()})` : ''}${isBreaking ? '!' : ''}: ${desc.trim()}`;
  const parts: string[] = [header];
  if (body.trim()) parts.push('\n' + body.trim());
  if (isBreaking && breakingNote.trim()) parts.push('\nBREAKING CHANGE: ' + breakingNote.trim());

  return parts.join('\n');
}

// ── Main command ───────────────────────────────────────────────────────────

export async function runCommit(): Promise<void> {
  const cwd = process.cwd();

  if (!await ensureGitRepo(cwd)) return;

  const config = getConfig();
  const convention = await detectConvention(cwd);
  const branch = getCurrentBranch(cwd);
  const repoName = getRepoName(cwd);

  if (isProtectedBranch(branch, config.git.protectedBranches)) {
    warning(`You are on a protected branch: "${branch}"`);
    const proceed = await confirmPrompt('Are you sure you want to commit here?', false);
    if (!proceed) { info('Commit cancelled.'); return; }
  }

  let staged = getStagedFiles(cwd);
  const unstaged = getUnstagedFiles(cwd);
  const untracked = getUntrackedFiles(cwd);

  // ── Staging step ──────────────────────────────────────────────────────────
  if (staged.length > 0) {
    section(`Currently Staged (${staged.length} file(s))`);
    for (const f of staged) {
      const statusChar = f.status.charAt(0).toUpperCase();
      console.log(`  ${statusChar}  ${f.path}`);
    }
    blank();

    const stagingChoice = await selectPrompt('How do you want to proceed?', [
      `Continue with these ${staged.length} staged file(s)`,
      'Add more files to staging',
      'Unstage all and re-select',
      'Cancel',
    ]);

    if (stagingChoice === 'Cancel') { info('Commit cancelled.'); return; }

    if (stagingChoice.startsWith('Unstage')) {
      unstageAll(cwd);
      staged = [];
    } else if (stagingChoice.startsWith('Add more')) {
      const available = [...unstaged, ...untracked];
      if (available.length === 0) {
        info('No additional files available to stage.');
      } else {
        const toAdd = await smartFileSelectPrompt('Select additional files to stage', available);
        if (toAdd.length > 0) {
          stageFiles(toAdd, cwd);
          staged = getStagedFiles(cwd);
        }
      }
    }
    // else: continue with existing staged files — fall through
  }

  if (staged.length === 0) {
    const available = [...unstaged, ...untracked];
    if (available.length === 0) { info('No changes to commit.'); return; }
    if (unstaged.length > 0) info(`${unstaged.length} modified file(s) not staged.`);
    if (untracked.length > 0) info(`${untracked.length} untracked file(s).`);
    const toStage = await smartFileSelectPrompt('Select files to stage', available);
    if (toStage.length === 0) { info('Nothing selected. Commit cancelled.'); return; }
    stageFiles(toStage, cwd);
    staged = getStagedFiles(cwd);
  }

  if (staged.length === 0) { info('No files staged. Commit cancelled.'); return; }

  // ── Security scan ─────────────────────────────────────────────────────────
  const scanResult = scanFiles(staged.map((f) => ({ path: f.path })), config.security.blockedFiles);
  if (!scanResult.clean) {
    if (scanResult.blockedFiles.length > 0) error(`Sensitive files staged: ${scanResult.blockedFiles.join(', ')}`);
    if (scanResult.detectedSecrets.length > 0) warning(`Potential secrets detected: ${scanResult.summary}`);
    if (config.security.blockOnSecrets) {
      error('Commit blocked due to security issues. Fix them before committing.');
      return;
    }
  }

  // ── Generate message ──────────────────────────────────────────────────────
  const ticket = extractTicketFromBranch(branch, config.commit.ticketPattern);
  const aiContext = buildAIContext({
    repoName, branch, ticket, convention, stagedFiles: staged,
    allowRawDiff: config.ai.allowRawDiff,
  });

  if (config.ai.showPromptBeforeSend) {
    section('AI Context (what will be sent)');
    console.log(JSON.stringify(aiContext, null, 2));
    blank();
  }

  const provider = await createProviderWithFallback(config);
  startSpinner(`Generating commit message with ${provider.name}...`);
  let message: string;
  try {
    message = await provider.generateCommitMessage(aiContext);
    succeedSpinner();
  } catch {
    failSpinner('Generation failed — falling back to guided builder');
    const built = await guidedMessageBuilder();
    if (!built) { info('Commit cancelled.'); return; }
    message = built;
  }

  if (message.length > convention.maxHeaderLength) {
    warning(`Message header exceeds max length (${message.length}/${convention.maxHeaderLength} chars)`);
  }

  // ── Review loop ───────────────────────────────────────────────────────────
  let done = false;
  while (!done) {
    section('Proposed Commit Message');
    console.log(`\n  ${message.split('\n').join('\n  ')}\n`);
    keyValue('Provider', provider.name);
    blank();

    const choice = await selectPrompt('What do you want to do?', [
      'Accept and commit',
      'Edit message (guided)',
      'Regenerate',
      'View AI context',
      'Cancel',
    ]);

    if (choice === 'Accept and commit') {
      const confirmed = await confirmPrompt(`Commit with message: "${message.split('\n')[0]}"?`);
      if (!confirmed) { info('Commit cancelled.'); return; }
      try {
        execSync(`git commit -m ${JSON.stringify(message)}`, { cwd, stdio: 'inherit' });
        success('Commit created successfully.');
      } catch {
        error('git commit failed.');
      }
      done = true;

    } else if (choice === 'Edit message (guided)') {
      const edited = await guidedMessageBuilder(message);
      if (edited) message = edited;

    } else if (choice === 'Regenerate') {
      startSpinner('Regenerating...');
      try {
        message = await provider.generateCommitMessage(aiContext);
        succeedSpinner();
      } catch {
        failSpinner();
      }

    } else if (choice === 'View AI context') {
      section('AI Context');
      console.log(JSON.stringify(aiContext, null, 2));

    } else {
      info('Commit cancelled.');
      done = true;
    }
  }
}
