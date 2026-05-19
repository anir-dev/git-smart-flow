import { execSync, spawnSync } from 'child_process';
import { ensureGitRepo } from '../git/ensure-repo.js';
import { validateRemoteName } from '../git/validate.js';
import {
  fetchRemote,
  getAheadBehindCount,
  getCurrentBranch,
  getLastCommit,
  getLastFetchTime,
  getUpstream,
  hasMergeConflicts,
} from '../git/repo.js';
import { blank, error, info, keyValue, section, success, warning } from '../ux/display.js';
import { confirmPrompt, selectPrompt } from '../ux/prompt.js';
import { failSpinner, startSpinner, succeedSpinner } from '../ux/spinner.js';

function relativeTime(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function git(args: string[], cwd: string): { ok: boolean; out: string; err: string } {
  const r = spawnSync('git', args, { cwd, encoding: 'utf-8' });
  return { ok: r.status === 0, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() };
}

function getIncomingCommits(upstream: string, cwd: string): string[] {
  const r = git(['log', `HEAD..${upstream}`, '--oneline'], cwd);
  return r.out.split('\n').filter(Boolean);
}

function getOutgoingCommits(upstream: string, cwd: string): string[] {
  const r = git(['log', `${upstream}..HEAD`, '--oneline'], cwd);
  return r.out.split('\n').filter(Boolean);
}

// ── Main command ───────────────────────────────────────────────────────────

export async function runSync(): Promise<void> {
  const cwd = process.cwd();
  if (!(await ensureGitRepo(cwd))) return;

  const upstream = getUpstream(cwd);
  if (!upstream) {
    section('Sync with Remote');
    warning('No upstream branch configured for this branch.');
    blank();
    info('Set one with:');
    console.log('  git branch --set-upstream-to=origin/<branch>');
    console.log('  gsf repo-init  →  option "Set up remote repository"');
    return;
  }

  section('Sync with Remote');
  const branch = getCurrentBranch(cwd);
  const lastFetch = getLastFetchTime(cwd);

  keyValue('Branch', branch);
  keyValue('Upstream', upstream);
  if (lastFetch) keyValue('Last fetch', relativeTime(lastFetch));
  blank();

  // ── Fetch ────────────────────────────────────────────────────────────────
  startSpinner('Fetching from remote...');
  const fetchResult = fetchRemote(cwd);
  if (fetchResult.ok) {
    succeedSpinner('Fetch complete');
  } else {
    failSpinner('Fetch failed');
    if (fetchResult.output) console.log('  ' + fetchResult.output);
    const proceed = await confirmPrompt('Continue with cached remote state?', true);
    if (!proceed) return;
  }

  blank();

  // ── Show sync status ─────────────────────────────────────────────────────
  const { ahead, behind } = getAheadBehindCount(upstream, cwd);
  const hasConflicts = hasMergeConflicts(cwd);

  section('Sync Status');

  if (ahead === 0 && behind === 0) {
    success(`Fully in sync with ${upstream}`);
    blank();
    return;
  }

  if (ahead > 0) {
    const commits = getOutgoingCommits(upstream, cwd);
    warning(`${ahead} local commit(s) not yet pushed to ${upstream}:`);
    commits.slice(0, 5).forEach((c) => console.log(`  ↑  ${c}`));
    if (commits.length > 5) info(`  ... and ${commits.length - 5} more`);
    blank();
  }

  if (behind > 0) {
    const commits = getIncomingCommits(upstream, cwd);
    info(`${behind} new commit(s) on ${upstream} not yet in local branch:`);
    commits.slice(0, 5).forEach((c) => console.log(`  ↓  ${c}`));
    if (commits.length > 5) info(`  ... and ${commits.length - 5} more`);
    blank();
  }

  if (hasConflicts) {
    warning('Active merge conflicts detected — resolve them before syncing.');
    await guideConflictResolution(cwd);
    return;
  }

  // ── Choose action ────────────────────────────────────────────────────────
  const options: string[] = [];
  if (behind > 0 && ahead === 0) {
    options.push('Pull (fast-forward) — bring in remote commits');
    options.push('Pull (rebase) — bring in remote commits, reapply mine on top  [clean history]');
  } else if (behind > 0 && ahead > 0) {
    options.push('Pull (merge) — merge remote commits, keep both histories');
    options.push('Pull (rebase) — reapply my commits on top of remote  [clean history]');
    options.push('Push first, then pull — only if remote allows force push');
  } else if (behind === 0 && ahead > 0) {
    options.push('Push my commits to remote');
  }
  options.push('View details only — do nothing');
  options.push('Cancel');

  const choice = await selectPrompt('What do you want to do?', options);

  blank();

  if (choice.startsWith('Pull (fast-forward)')) {
    await doPull(cwd, upstream, 'ff-only');
  } else if (choice.startsWith('Pull (merge)')) {
    await doPull(cwd, upstream, 'merge');
  } else if (choice.startsWith('Pull (rebase)')) {
    await doPull(cwd, upstream, 'rebase');
  } else if (choice.startsWith('Push my commits')) {
    doPush(cwd, ahead, upstream);
  } else if (choice.startsWith('Push first')) {
    warning('This requires a force push and can overwrite remote commits.');
    const confirm = await confirmPrompt('Force push first?', false);
    if (confirm) {
      try {
        execSync('git push --force-with-lease', { cwd, stdio: 'inherit' });
        success('Pushed.');
      } catch {
        error('Push failed.');
      }
    }
  }
}

// ── Pull ──────────────────────────────────────────────────────────────────

async function doPull(
  cwd: string,
  upstream: string,
  mode: 'ff-only' | 'merge' | 'rebase'
): Promise<void> {
  const upstreamParts = upstream.split('/');
  const remote = upstreamParts[0] ?? '';
  const remoteBranch = upstreamParts.slice(1).join('/');
  const remoteCheck = validateRemoteName(remote);
  if (!remoteCheck.valid) {
    error(`Invalid remote name "${remote}": ${remoteCheck.reason}`);
    return;
  }

  const pullArgs: string[] = ['pull', remote, remoteBranch];
  if (mode === 'ff-only') pullArgs.push('--ff-only');
  if (mode === 'rebase') pullArgs.push('--rebase');

  startSpinner(`Pulling (${mode})...`);
  const r = git(pullArgs, cwd);

  if (r.ok) {
    succeedSpinner('Pull complete.');
    blank();
    const last = getLastCommit(cwd);
    if (last) success(`Now at: ${last.shortSha}  "${last.message}"`);
    return;
  }

  failSpinner('Pull failed.');
  blank();

  if (r.err.includes('conflict') || hasMergeConflicts(cwd)) {
    warning('Merge conflicts occurred during pull.');
    await guideConflictResolution(cwd);
  } else if (r.err.includes('non-fast-forward') || r.err.includes('diverged')) {
    warning('Branches have diverged — fast-forward not possible.');
    info('Try "Pull (rebase)" to reapply your commits on top of the remote.');
  } else {
    error(r.err || r.out);
  }
}

// ── Push ──────────────────────────────────────────────────────────────────

function doPush(cwd: string, ahead: number, upstream: string): void {
  info(`Pushing ${ahead} commit(s) to ${upstream}...`);
  try {
    execSync('git push', { cwd, stdio: 'inherit' });
    success('Push complete.');
  } catch {
    error('Push failed. The remote may have new commits — run sync again to pull first.');
  }
}

// ── Conflict resolution guide ─────────────────────────────────────────────

async function guideConflictResolution(cwd: string): Promise<void> {
  section('Conflict Resolution Guide');

  // Show which files have conflicts
  const r = git(['diff', '--name-only', '--diff-filter=U'], cwd);
  const conflictFiles = r.out.split('\n').filter(Boolean);

  if (conflictFiles.length > 0) {
    warning(`${conflictFiles.length} file(s) with conflicts:`);
    conflictFiles.forEach((f) => console.log(`  ✖  ${f}`));
  }

  blank();
  console.log('  Conflict markers look like this inside the files:');
  console.log('');
  console.log('    <<<<<<< HEAD          ← your changes');
  console.log('    your code here');
  console.log('    =======');
  console.log('    incoming code here');
  console.log('    >>>>>>> origin/main   ← remote changes');
  console.log('');
  info('Edit each file, remove the markers, keep what you want.');
  blank();

  const choice = await selectPrompt('How do you want to resolve?', [
    'I will edit the files manually — show me what to do next',
    'Abort the merge — go back to pre-merge state',
    'Accept all INCOMING changes (theirs)',
    'Accept all LOCAL changes (mine)',
  ]);

  if (choice.startsWith('Abort')) {
    const r = git(['merge', '--abort'], cwd);
    if (!r.ok) git(['rebase', '--abort'], cwd); // might be a rebase
    success('Merge/rebase aborted. Branch restored to pre-merge state.');
    return;
  }

  if (choice.startsWith('Accept all INCOMING')) {
    for (const f of conflictFiles) {
      git(['checkout', '--theirs', '--', f], cwd);
      git(['add', f], cwd);
    }
    success('All conflicts resolved with incoming (remote) changes.');
    info('Review the files, then run "gsf commit" to complete the merge.');
    return;
  }

  if (choice.startsWith('Accept all LOCAL')) {
    for (const f of conflictFiles) {
      git(['checkout', '--ours', '--', f], cwd);
      git(['add', f], cwd);
    }
    success('All conflicts resolved with local changes.');
    info('Review the files, then run "gsf commit" to complete the merge.');
    return;
  }

  // Manual resolution instructions
  blank();
  info('Steps:');
  console.log('  1. Open each conflicted file in your editor');
  console.log('  2. Find and resolve all <<<<<<< / ======= / >>>>>>> markers');
  console.log('  3. Save the file');
  console.log('  4. Run "gsf commit" — it will detect the merge and suggest a message');
  blank();
  info('To check remaining conflicts at any time:');
  console.log('  git diff --name-only --diff-filter=U');
  blank();
  info('To abort and start over:');
  console.log('  git merge --abort   (or git rebase --abort)');
}
