import { execSync, spawnSync } from 'child_process';
import { getCurrentBranch, hasUncommittedChanges, hasMergeConflicts } from '../git/repo.js';
import { getConfig } from '../config/config.js';
import { ensureGitRepo } from '../git/ensure-repo.js';
import { blank, error, info, keyValue, section, success, warning } from '../ux/display.js';
import { confirmPrompt, inputPrompt } from '../ux/prompt.js';
import { startSpinner, succeedSpinner, failSpinner } from '../ux/spinner.js';

export async function runMerge(): Promise<void> {
  const cwd = process.cwd();

  if (!await ensureGitRepo(cwd)) return;

  if (hasUncommittedChanges(cwd)) {
    error('You have uncommitted changes. Commit or stash them before merging.');
    return;
  }

  const config = getConfig();
  const currentBranch = getCurrentBranch(cwd);

  // List branches
  const branchResult = spawnSync('git', ['branch', '-a', '--format=%(refname:short)'], {
    cwd, encoding: 'utf-8',
  });
  const allBranches = (branchResult.stdout ?? '').split('\n')
    .map((b) => b.trim())
    .filter((b) => b && b !== currentBranch && !b.includes('HEAD'));

  section('Merge Assistant');
  keyValue('Current branch', currentBranch);
  blank();

  let sourceBranch = await inputPrompt(
    `Branch to merge INTO "${currentBranch}"`,
    config.git.defaultBaseBranches[0]
  );

  // Fetch
  startSpinner('Fetching from remote...');
  try {
    execSync('git fetch', { cwd, stdio: 'pipe' });
    succeedSpinner('Fetched.');
  } catch {
    failSpinner('Fetch failed — continuing with local state.');
  }

  // Show commits that will be merged
  const logResult = spawnSync('git', ['log', `${currentBranch}..${sourceBranch}`, '--oneline'], {
    cwd, encoding: 'utf-8',
  });
  const commits = (logResult.stdout ?? '').split('\n').filter(Boolean);

  section(`Commits to merge from "${sourceBranch}"`);
  if (commits.length === 0) {
    info('No new commits to merge.');
    return;
  }
  commits.forEach((c) => console.log('  ' + c));
  blank();

  const confirmed = await confirmPrompt(`Merge "${sourceBranch}" into "${currentBranch}"?`);
  if (!confirmed) { info('Merge cancelled.'); return; }

  try {
    execSync(`git merge ${sourceBranch}`, { cwd, stdio: 'inherit' });
    if (hasMergeConflicts(cwd)) {
      warning('Merge conflicts detected. Resolve them and run "git commit" to finish.');
      const conflictResult = spawnSync('git', ['diff', '--name-only', '--diff-filter=U'], {
        cwd, encoding: 'utf-8',
      });
      const conflicted = (conflictResult.stdout ?? '').split('\n').filter(Boolean);
      section('Conflicted files');
      conflicted.forEach((f) => console.log('  ' + f));
    } else {
      success(`Merge of "${sourceBranch}" completed.`);
    }
  } catch {
    error('git merge failed.');
    if (hasMergeConflicts(cwd)) {
      warning('Resolve conflicts manually and run "git commit".');
    }
  }
}
