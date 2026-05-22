import { execSync, spawnSync } from 'child_process';
import { existsSync, appendFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { ensureGitRepo } from '../git/ensure-repo.js';
import { hasCommits, unstageAll } from '../git/repo.js';
import { validateFilePath } from '../git/validate.js';
import { getConfig } from '../config/config.js';
import { guidedMessageBuilder } from './commit.js';
import { blank, divider, error, info, keyValue, section, success, warning } from '../ux/display.js';
import { confirmPrompt, inputPrompt, selectPrompt, smartFileSelectPrompt } from '../ux/prompt.js';

// ── Git helpers ────────────────────────────────────────────────────────────

function git(args: string[], cwd: string): { ok: boolean; out: string; err: string } {
  const r = spawnSync('git', args, { cwd, encoding: 'utf-8' });
  return { ok: r.status === 0, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() };
}

interface Commit {
  sha: string;
  shortSha: string;
  msg: string;
  date: string;
  author: string;
}

function getRecentCommits(n: number, cwd: string): Commit[] {
  const r = git(['log', `-${n}`, '--format=%H\x1f%s\x1f%ar\x1f%an'], cwd);
  if (!r.ok || !r.out) return [];
  return r.out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('\x1f');
      const sha = parts[0] ?? '';
      const msg = parts[1] ?? '';
      const date = parts[2] ?? '';
      const author = parts[3] ?? '';
      return { sha, shortSha: sha.slice(0, 8), msg, date, author };
    });
}

function getCommitsAheadOfRemote(cwd: string): number {
  const r = git(['rev-list', '--count', '@{u}..HEAD'], cwd);
  return r.ok ? parseInt(r.out, 10) || 0 : -1; // -1 = no upstream
}

function getFilesInCommit(sha: string, cwd: string): string[] {
  const r = git(['show', '--name-only', '--format=', sha], cwd);
  return r.out.split('\n').filter(Boolean);
}

function getUpstreamBranch(cwd: string): string | null {
  const r = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], cwd);
  return r.ok ? r.out : null;
}

function getCurrentBranch(cwd: string): string {
  const r = git(['symbolic-ref', '--short', 'HEAD'], cwd);
  return r.ok ? r.out : 'HEAD';
}

function _isPushed(cwd: string): boolean {
  const ahead = getCommitsAheadOfRemote(cwd);
  return ahead === 0; // 0 means all commits are on remote; -1 means no upstream
}

// ── Status banner ──────────────────────────────────────────────────────────

function printState(cwd: string): void {
  const commits = getRecentCommits(1, cwd);
  const branch = getCurrentBranch(cwd);
  const ahead = getCommitsAheadOfRemote(cwd);
  const upstream = getUpstreamBranch(cwd);

  section('Repository State');
  keyValue('Branch', branch);
  if (commits.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const c = commits[0]!;
    keyValue('Last commit', `${c.shortSha}  "${c.msg}"  (${c.date})`);
  } else {
    info('No commits yet.');
  }
  if (upstream) {
    if (ahead === 0) keyValue('Remote', `in sync with ${upstream}`);
    else if (ahead > 0)
      keyValue('Remote', `${ahead} commit(s) ahead of ${upstream} — not yet pushed`);
  } else {
    keyValue('Remote', 'no upstream configured');
  }
  blank();
}

// ── Safety banner ──────────────────────────────────────────────────────────

function warnDestructive(detail: string): void {
  blank();
  console.log('  ╔══════════════════════════════════════════════════════╗');
  console.log('  ║  ⚠  DESTRUCTIVE OPERATION — cannot be undone        ║');
  console.log('  ╚══════════════════════════════════════════════════════╝');
  console.log('  ' + detail);
  blank();
}

function warnHistoryRewrite(pushed: boolean): void {
  if (!pushed) return;
  blank();
  warning('This commit has already been pushed to the remote.');
  warning('Rewriting history will require a force push, which can cause');
  warning('problems for anyone who has already fetched or cloned this branch.');
  blank();
}

// ── Main command ───────────────────────────────────────────────────────────

interface RunOptions {
  dryRun?: boolean;
  yes?: boolean;
}

export async function runRevert(opts: RunOptions = {}): Promise<void> {
  const cwd = process.cwd();
  if (!(await ensureGitRepo(cwd))) return;

  if (opts.dryRun) info('[DRY RUN] No changes will be made.\n');

  if (!hasCommits(cwd)) {
    info('No commits yet — nothing to revert.');
    const unstage =
      opts.yes || opts.dryRun ? true : await confirmPrompt('Unstage all files instead?', true);
    if (unstage) {
      if (opts.dryRun) {
        info('[DRY RUN] Would unstage all files.');
        return;
      }
      unstageAll(cwd);
      success('All files unstaged. Working tree untouched.');
    }
    return;
  }

  let running = true;
  while (running) {
    printState(cwd);

    const choice = await selectPrompt('What do you want to undo or fix?', [
      'Remove files from the last commit  (forgot to gitignore, wrong files…)',
      'Undo the last commit — keep changes staged  (soft reset)',
      'Undo the last commit — keep changes unstaged  (mixed reset)',
      'Undo the last commit — DISCARD all changes  (hard reset)',
      'Go back N commits  (choose soft / mixed / hard)',
      'Reset to a specific commit  (pick from history)',
      'Reset to the remote branch state  (discard all local commits)',
      'Safely undo a pushed commit  (creates a new revert commit)',
      'Discard uncommitted changes in working directory',
      'Unstage staged files  (keep changes in working directory)',
      'Cherry-pick a commit from another branch',
      'Done / Cancel',
    ]);

    blank();

    switch (choice) {
      case 'Remove files from the last commit  (forgot to gitignore, wrong files…)':
        await flowRemoveFilesFromCommit(cwd, opts);
        break;
      case 'Undo the last commit — keep changes staged  (soft reset)':
        await flowResetLast(cwd, 'soft', opts);
        break;
      case 'Undo the last commit — keep changes unstaged  (mixed reset)':
        await flowResetLast(cwd, 'mixed', opts);
        break;
      case 'Undo the last commit — DISCARD all changes  (hard reset)':
        await flowResetLast(cwd, 'hard', opts);
        break;
      case 'Go back N commits  (choose soft / mixed / hard)':
        await flowResetN(cwd, opts);
        break;
      case 'Reset to a specific commit  (pick from history)':
        await flowResetToCommit(cwd, opts);
        break;
      case 'Reset to the remote branch state  (discard all local commits)':
        await flowResetToRemote(cwd, opts);
        break;
      case 'Safely undo a pushed commit  (creates a new revert commit)':
        await flowSafeRevert(cwd, opts);
        break;
      case 'Discard uncommitted changes in working directory':
        await flowDiscardWorkingChanges(cwd, opts);
        break;
      case 'Unstage staged files  (keep changes in working directory)':
        await flowUnstage(cwd, opts);
        break;
      case 'Cherry-pick a commit from another branch':
        await flowCherryPick(cwd, opts);
        break;
      default:
        running = false;
    }

    if (running && choice !== 'Done / Cancel') {
      blank();
      const again = opts.yes ? false : await confirmPrompt('Do another undo operation?', false);
      if (!again) running = false;
    }
  }

  divider();
}

// ── Flow: remove files from last commit ───────────────────────────────────

async function flowRemoveFilesFromCommit(cwd: string, opts: RunOptions = {}): Promise<void> {
  section('Remove Files from Last Commit');

  const commits = getRecentCommits(1, cwd);
  if (commits.length === 0) {
    info('No commits found.');
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const last = commits[0]!;

  info(`Last commit: ${last.shortSha}  "${last.msg}"`);
  blank();

  const filesInCommit = getFilesInCommit('HEAD', cwd);
  if (filesInCommit.length === 0) {
    info('No files found in last commit.');
    return;
  }

  info(`${filesInCommit.length} file(s) in this commit.`);

  const aheadCount = getCommitsAheadOfRemote(cwd);
  // aheadCount === -1 means no upstream; === 0 means all commits are on remote (pushed)
  const alreadyPushed = aheadCount >= 0 && aheadCount === 0;
  warnHistoryRewrite(alreadyPushed);

  const toRemove = await smartFileSelectPrompt(
    'Select files to remove from the commit',
    filesInCommit
  );
  if (toRemove.length === 0) {
    info('Nothing selected. Cancelled.');
    return;
  }

  blank();
  warning(`Will remove ${toRemove.length} file(s) from commit "${last.shortSha}" and amend it.`);
  if (alreadyPushed) warning('A force push will be needed afterwards.');

  const confirmed = opts.yes || opts.dryRun ? true : await confirmPrompt('Proceed?', false);
  if (!confirmed) {
    info('Cancelled.');
    return;
  }

  for (const f of toRemove) {
    const vf = validateFilePath(f);
    if (!vf.valid) {
      error(`Invalid file path "${f}": ${vf.reason}`);
      return;
    }
  }

  if (opts.dryRun) {
    info(
      `[DRY RUN] Would remove ${toRemove.length} file(s) from commit "${last.shortSha}" and amend it.`
    );
    return;
  }

  // Remove from index (working tree untouched)
  const rm = spawnSync('git', ['rm', '--cached', '-r', '--', ...toRemove], {
    cwd,
    encoding: 'utf-8',
  });
  if (rm.status !== 0) {
    error(`git rm failed: ${rm.stderr?.trim()}`);
    return;
  }

  // Offer to also add to .gitignore
  await offerGitignoreAppend(toRemove, cwd);

  // Amend the commit
  const editMsg = await confirmPrompt('Edit the commit message?', false);
  if (editMsg) {
    const built = await guidedMessageBuilder(last.msg);
    if (built) {
      try {
        execSync(`git commit --amend -m ${JSON.stringify(built)}`, { cwd, stdio: 'inherit' });
      } catch {
        error('git commit --amend failed.');
        return;
      }
    } else {
      try {
        execSync('git commit --amend --no-edit', { cwd, stdio: 'inherit' });
      } catch {
        error('git commit --amend failed.');
        return;
      }
    }
  } else {
    try {
      execSync('git commit --amend --no-edit', { cwd, stdio: 'inherit' });
    } catch {
      error('git commit --amend failed.');
      return;
    }
  }

  success(`${toRemove.length} file(s) removed from commit.`);
  blank();
  if (alreadyPushed) {
    warning('Run "gsf push" — it will detect the force push needed.');
  }
}

async function offerGitignoreAppend(files: string[], cwd: string): Promise<void> {
  // Detect patterns that should go to .gitignore
  const patterns = new Set<string>();
  for (const f of files) {
    const topDir = f.includes('/') ? f.split('/')[0] + '/' : f;
    // Suggest directory-level entries for dirs, exact name for root files
    patterns.add(topDir);
  }

  const gitignorePath = join(cwd, '.gitignore');
  const existing = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf-8') : '';
  const toAdd = [...patterns].filter((p) => !existing.includes(p));

  if (toAdd.length === 0) return;

  blank();
  info('These patterns are not yet in .gitignore:');
  toAdd.forEach((p) => console.log(`  ${p}`));

  const add = await confirmPrompt('Add them to .gitignore to prevent re-staging?', true);
  if (!add) return;

  const lines = '\n# Added by gsf revert\n' + toAdd.join('\n') + '\n';
  appendFileSync(gitignorePath, lines);
  success('.gitignore updated.');

  // Stage the .gitignore change so it's part of the amended commit
  spawnSync('git', ['add', '.gitignore'], { cwd });
}

// ── Flow: undo last commit ─────────────────────────────────────────────────

async function flowResetLast(
  cwd: string,
  mode: 'soft' | 'mixed' | 'hard',
  opts: RunOptions = {}
): Promise<void> {
  const commits = getRecentCommits(2, cwd);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const last = commits[0]!;
  const aheadCount = getCommitsAheadOfRemote(cwd);
  const alreadyPushed = aheadCount >= 0 && aheadCount === 0;

  const modeDesc: Record<string, string> = {
    soft: 'Commit undone. Changes stay STAGED — ready to re-commit.',
    mixed: 'Commit undone. Changes go back to UNSTAGED — you choose what to re-stage.',
    hard: 'Commit undone. ALL changes DISCARDED — working directory reset to previous commit.',
  };

  section(`Undo Last Commit (${mode})`);
  if (last) info(`Will undo: ${last.shortSha}  "${last.msg}"  (${last.date})`);
  if (commits[1]) info(`Landing on: ${commits[1].shortSha}  "${commits[1].msg}"`);
  blank();
  info(`Effect: ${modeDesc[mode]}`);
  warnHistoryRewrite(alreadyPushed);
  if (mode === 'hard')
    warnDestructive('All changes from the undone commit will be permanently lost.');

  const confirmed = opts.yes || opts.dryRun ? true : await confirmPrompt('Proceed?', false);
  if (!confirmed) {
    info('Cancelled.');
    return;
  }

  if (opts.dryRun) {
    info(`[DRY RUN] Would run: git reset --${mode} HEAD~1`);
    return;
  }

  const r = git(['reset', `--${mode}`, 'HEAD~1'], cwd);
  if (r.ok) {
    success(`Last commit undone (${mode}).`);
    if (mode === 'soft') info('Changes are staged. Run "gsf commit" to recommit.');
    if (mode === 'mixed') info('Changes are unstaged. Run "gsf commit" to restage and recommit.');
    if (alreadyPushed) warning('Run "gsf push" — force push will be needed.');
  } else {
    error(`Reset failed: ${r.err}`);
  }
}

// ── Flow: go back N commits ────────────────────────────────────────────────

async function flowResetN(cwd: string, opts: RunOptions = {}): Promise<void> {
  section('Go Back N Commits');

  const commits = getRecentCommits(15, cwd);
  if (commits.length === 0) {
    info('No commits found.');
    return;
  }

  info('Recent commits:');
  commits.forEach((c, i) => {
    console.log(`  ${String(i + 1).padStart(2)}.  ${c.shortSha}  ${c.date.padEnd(14)}  ${c.msg}`);
  });
  blank();

  const nStr = await inputPrompt('How many commits to go back?', '1');
  const n = parseInt(nStr, 10);
  if (!n || n < 1 || n > commits.length) {
    error('Invalid number.');
    return;
  }

  const modeChoice = await selectPrompt('Reset mode:', [
    'mixed — keep changes unstaged  (recommended)',
    'soft  — keep changes staged',
    'hard  — DISCARD all changes',
  ]);
  const mode = modeChoice.split(' ')[0] as 'soft' | 'mixed' | 'hard';

  const aheadCount = getCommitsAheadOfRemote(cwd);
  const alreadyPushed = aheadCount !== -1 && n > aheadCount;

  blank();
  const targetCommit = commits[n - 1];
  if (!targetCommit) {
    error('Invalid commit selection');
    return;
  }
  info(`Will reset ${n} commit(s) — landing on: ${targetCommit.shortSha} "${targetCommit.msg}"`);
  warnHistoryRewrite(alreadyPushed);
  if (mode === 'hard')
    warnDestructive(`Changes from the last ${n} commit(s) will be permanently lost.`);

  const confirmed = opts.yes || opts.dryRun ? true : await confirmPrompt('Proceed?', false);
  if (!confirmed) {
    info('Cancelled.');
    return;
  }

  if (opts.dryRun) {
    info(`[DRY RUN] Would run: git reset --${mode} HEAD~${n}`);
    return;
  }

  const r = git(['reset', `--${mode}`, `HEAD~${n}`], cwd);
  if (r.ok) {
    success(`Went back ${n} commit(s) (${mode}).`);
    if (alreadyPushed) warning('Force push needed. Run "gsf push".');
  } else {
    error(`Reset failed: ${r.err}`);
  }
}

// ── Flow: reset to specific commit ────────────────────────────────────────

async function flowResetToCommit(cwd: string, opts: RunOptions = {}): Promise<void> {
  section('Reset to a Specific Commit');

  const historyLimit = getConfig().ui?.historyLimit ?? 20;
  const commits = getRecentCommits(historyLimit, cwd);
  if (commits.length === 0) {
    info('No commits found.');
    return;
  }

  const labels = commits.map((c) => `${c.shortSha}  ${c.date.padEnd(14)}  ${c.msg}`);
  const chosen = await selectPrompt(
    'Choose the commit to land on (this and all later commits will be undone):',
    labels
  );
  const idx = labels.indexOf(chosen);
  const target = commits[idx];
  if (!target) {
    info('Cancelled.');
    return;
  }

  const modeChoice = await selectPrompt('Reset mode:', [
    'mixed — keep changes unstaged  (recommended)',
    'soft  — keep changes staged',
    'hard  — DISCARD all changes',
  ]);
  const mode = modeChoice.split(' ')[0] as 'soft' | 'mixed' | 'hard';

  const aheadCount = getCommitsAheadOfRemote(cwd);
  const alreadyPushed = aheadCount !== -1 && idx >= aheadCount;

  blank();
  info(`Will reset to: ${target.shortSha}  "${target.msg}"`);
  warnHistoryRewrite(alreadyPushed);
  if (mode === 'hard')
    warnDestructive('All changes between now and the chosen commit will be permanently lost.');

  const confirmed = opts.yes || opts.dryRun ? true : await confirmPrompt('Proceed?', false);
  if (!confirmed) {
    info('Cancelled.');
    return;
  }

  if (opts.dryRun) {
    info(`[DRY RUN] Would run: git reset --${mode} ${target.sha} (${target.shortSha})`);
    return;
  }

  const r = git(['reset', `--${mode}`, target.sha], cwd);
  if (r.ok) {
    success(`Reset to ${target.shortSha} (${mode}).`);
    if (alreadyPushed) warning('Force push needed. Run "gsf push".');
  } else {
    error(`Reset failed: ${r.err}`);
  }
}

// ── Flow: reset to remote ─────────────────────────────────────────────────

async function flowResetToRemote(cwd: string, opts: RunOptions = {}): Promise<void> {
  section('Reset to Remote Branch State');

  const upstream = getUpstreamBranch(cwd);
  if (!upstream) {
    warning('No upstream branch configured.');
    info('Set one with:  git branch --set-upstream-to=origin/<branch>');
    return;
  }

  const ahead = getCommitsAheadOfRemote(cwd);
  blank();
  keyValue('Remote', upstream);
  if (ahead > 0) warning(`You are ${ahead} commit(s) ahead — these will all be DISCARDED.`);

  warnDestructive(`All local commits not on ${upstream} and all uncommitted changes will be lost.`);

  const confirmed =
    opts.yes || opts.dryRun
      ? true
      : await confirmPrompt(`Reset to ${upstream}? This cannot be undone.`, false);
  if (!confirmed) {
    info('Cancelled.');
    return;
  }

  if (opts.dryRun) {
    info(`[DRY RUN] Would run: git fetch && git reset --hard ${upstream}`);
    return;
  }

  // Fetch latest from remote first
  info('Fetching from remote...');
  const fetch = git(['fetch'], cwd);
  if (!fetch.ok) warning('Fetch failed — using cached remote state.');

  const r = git(['reset', '--hard', upstream], cwd);
  if (r.ok) {
    success(`Branch reset to ${upstream}.`);
    blank();
    info('Working directory matches remote exactly.');
  } else {
    error(`Reset failed: ${r.err}`);
  }
}

// ── Flow: safe revert (new commit) ────────────────────────────────────────

async function flowSafeRevert(cwd: string, opts: RunOptions = {}): Promise<void> {
  section('Safely Undo a Commit (git revert)');

  blank();
  info('git revert creates a NEW commit that undoes a previous one.');
  info('This is safe for shared/pushed history — no force push needed.');
  blank();

  const historyLimit = getConfig().ui?.historyLimit ?? 20;
  const commits = getRecentCommits(historyLimit, cwd);
  if (commits.length === 0) {
    info('No commits found.');
    return;
  }

  const labels = commits.map((c) => `${c.shortSha}  ${c.date.padEnd(14)}  ${c.msg}`);
  const chosen = await selectPrompt('Choose the commit to revert:', labels);
  const target = commits[labels.indexOf(chosen)];
  if (!target) {
    info('Cancelled.');
    return;
  }

  blank();
  info(`Will create a new commit that undoes: ${target.shortSha}  "${target.msg}"`);

  const confirmed = opts.yes || opts.dryRun ? true : await confirmPrompt('Proceed?', false);
  if (!confirmed) {
    info('Cancelled.');
    return;
  }

  if (opts.dryRun) {
    info(`[DRY RUN] Would create a revert commit undoing: ${target.shortSha}  "${target.msg}"`);
    return;
  }

  const r = git(['revert', '--no-commit', target.sha], cwd);
  if (!r.ok) {
    if (r.err.includes('conflict')) {
      warning('Revert produced merge conflicts. Resolve them, then run:');
      console.log('  git revert --continue');
    } else {
      error(`Revert failed: ${r.err}`);
    }
    return;
  }

  const editMsg = await confirmPrompt('Edit the revert commit message?', false);
  let msg = `revert: undo "${target.msg}" (${target.shortSha})`;
  if (editMsg) {
    const built = await guidedMessageBuilder(msg);
    if (built) msg = built;
  }

  try {
    execSync(`git commit -m ${JSON.stringify(msg)}`, { cwd, stdio: 'inherit' });
    success(`Revert commit created. No force push needed.`);
  } catch {
    error('git commit failed.');
  }
}

// ── Flow: discard working directory changes ────────────────────────────────

async function flowDiscardWorkingChanges(cwd: string, opts: RunOptions = {}): Promise<void> {
  section('Discard Uncommitted Changes');

  const r = git(['diff', '--name-only'], cwd);
  const modified = r.out.split('\n').filter(Boolean);
  if (modified.length === 0) {
    info('No uncommitted changes in tracked files.');
    return;
  }

  info(`${modified.length} file(s) with uncommitted changes:`);
  modified.slice(0, 10).forEach((f) => console.log(`  ${f}`));
  if (modified.length > 10) info(`  ... and ${modified.length - 10} more`);
  blank();

  const scope = await selectPrompt('What do you want to discard?', [
    'All changes in all files',
    'Choose specific files',
    'Cancel',
  ]);
  if (scope === 'Cancel') return;

  const targets =
    scope === 'All changes in all files'
      ? modified
      : await smartFileSelectPrompt('Select files to discard', modified);

  if (targets.length === 0) {
    info('Nothing selected.');
    return;
  }

  for (const f of targets) {
    const vf = validateFilePath(f);
    if (!vf.valid) {
      error(`Invalid file path "${f}": ${vf.reason}`);
      return;
    }
  }

  warnDestructive(`Changes in ${targets.length} file(s) will be lost and cannot be recovered.`);
  const confirmed =
    opts.yes || opts.dryRun ? true : await confirmPrompt('Discard these changes?', false);
  if (!confirmed) {
    info('Cancelled.');
    return;
  }

  if (opts.dryRun) {
    info(`[DRY RUN] Would discard changes in ${targets.length} file(s).`);
    return;
  }

  const restore = git(['restore', '--', ...targets], cwd);
  if (restore.ok) {
    success(`Discarded changes in ${targets.length} file(s).`);
  } else {
    // Fallback for older git versions
    const checkout = git(['checkout', '--', ...targets], cwd);
    if (checkout.ok) success(`Discarded changes in ${targets.length} file(s).`);
    else error(`Failed: ${checkout.err}`);
  }
}

// ── Flow: unstage ──────────────────────────────────────────────────────────

async function flowUnstage(cwd: string, opts: RunOptions = {}): Promise<void> {
  section('Unstage Files');

  const r = git(['diff', '--cached', '--name-only'], cwd);
  const staged = r.out.split('\n').filter(Boolean);
  if (staged.length === 0) {
    info('No staged files.');
    return;
  }

  const scope = await selectPrompt(
    `${staged.length} staged file(s). What do you want to unstage?`,
    ['All staged files', 'Choose specific files', 'Cancel']
  );
  if (scope === 'Cancel') return;

  const targets =
    scope === 'All staged files'
      ? staged
      : await smartFileSelectPrompt('Select files to unstage', staged);

  if (targets.length === 0) {
    info('Nothing selected.');
    return;
  }

  if (opts.dryRun) {
    info(`[DRY RUN] Would unstage ${targets.length} file(s).`);
    return;
  }

  const hasC = hasCommits(cwd);
  const restoreArgs = hasC
    ? ['restore', '--staged', '--', ...targets]
    : ['rm', '--cached', '-r', '--', ...targets];

  const result = git(restoreArgs, cwd);
  if (result.ok) {
    success(`${targets.length} file(s) unstaged. Changes kept in working directory.`);
  } else {
    error(`Failed: ${result.err}`);
  }
}

// ── Flow: cherry-pick ──────────────────────────────────────────────────────

async function flowCherryPick(cwd: string, opts: RunOptions = {}): Promise<void> {
  section('Cherry-pick a Commit from Another Branch');

  blank();
  info('Fetching recent commits from all branches...');

  const historyLimit = getConfig().ui?.historyLimit ?? 20;
  const r = git(['log', '--oneline', '--all', '--not', 'HEAD', `-${historyLimit}`], cwd);
  const lines = r.out.split('\n').filter(Boolean);

  if (lines.length === 0) {
    info('No commits found on other branches that are not already in your current branch.');
    return;
  }

  blank();
  const chosen = await selectPrompt('Select a commit to cherry-pick:', [...lines, '← Cancel']);
  if (chosen.includes('← Cancel')) return;

  const sha = chosen.split(' ')[0] ?? '';
  if (!sha) return;

  blank();
  keyValue('Commit', chosen);
  blank();

  const mode = await selectPrompt('How do you want to apply it?', [
    'Cherry-pick directly  (creates a new commit)',
    'Stage only, no commit  (--no-commit, review before committing)',
    '← Cancel',
  ]);
  if (mode.includes('← Cancel')) return;

  const noCommit = mode.includes('no commit');

  if (opts.dryRun) {
    info(`[DRY RUN] Would cherry-pick ${sha}${noCommit ? ' --no-commit' : ''}`);
    return;
  }

  const args = ['cherry-pick', ...(noCommit ? ['--no-commit'] : []), sha];
  const result = spawnSync('git', args, { cwd, stdio: 'inherit' });

  if (result.status === 0) {
    if (noCommit) {
      success('Changes staged. Review with "git diff --cached", then run "gsf commit".');
    } else {
      success('Cherry-pick applied successfully.');
    }
  } else {
    warning('Cherry-pick produced conflicts. Resolve them, then:');
    console.log('  git add <resolved-files>');
    console.log('  git cherry-pick --continue');
    blank();
    info('To abort: git cherry-pick --abort');
  }
}
