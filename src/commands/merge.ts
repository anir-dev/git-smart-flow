import { spawnSync } from 'child_process';
import { getCurrentBranch, hasUncommittedChanges, hasMergeConflicts } from '../git/repo.js';
import { validateRef } from '../git/validate.js';
import { getConfig } from '../config/config.js';
import { ensureGitRepo } from '../git/ensure-repo.js';
import { blank, error, info, keyValue, section, success, warning } from '../ux/display.js';
import { confirmPrompt, inputPrompt, selectPrompt } from '../ux/prompt.js';
import { startSpinner, succeedSpinner, failSpinner } from '../ux/spinner.js';

export interface RunOptions {
  dryRun?: boolean;
  yes?: boolean;
}

export async function runMerge(opts: RunOptions = {}): Promise<void> {
  const cwd = process.cwd();

  if (opts.dryRun) info('[DRY RUN] No changes will be made.\n');
  if (!(await ensureGitRepo(cwd))) return;

  if (hasUncommittedChanges(cwd)) {
    error('You have uncommitted changes. Commit or stash them before merging.');
    return;
  }

  const config = getConfig();
  const currentBranch = getCurrentBranch(cwd);

  // List branches
  const branchResult = spawnSync('git', ['branch', '-a', '--format=%(refname:short)'], {
    cwd,
    encoding: 'utf-8',
  });
  const _allBranches = (branchResult.stdout ?? '')
    .split('\n')
    .map((b) => b.trim())
    .filter((b) => b && b !== currentBranch && !b.includes('HEAD'));

  section('Merge Assistant');
  keyValue('Current branch', currentBranch);
  blank();

  const sourceBranch = await inputPrompt(
    `Branch to merge INTO "${currentBranch}"`,
    config.git.defaultBaseBranches[0]
  );

  const refCheck = validateRef(sourceBranch);
  if (!refCheck.valid) {
    error(`Invalid ref "${sourceBranch}": ${refCheck.reason}`);
    return;
  }

  // Fetch
  startSpinner('Fetching from remote...');
  const fetchResult = spawnSync('git', ['fetch'], { cwd, stdio: 'pipe' });
  if (fetchResult.status === 0) {
    succeedSpinner('Fetched.');
  } else {
    failSpinner('Fetch failed — continuing with local state.');
  }

  // Show commits that will be merged
  const logResult = spawnSync('git', ['log', `${currentBranch}..${sourceBranch}`, '--oneline'], {
    cwd,
    encoding: 'utf-8',
  });
  const commits = (logResult.stdout ?? '').split('\n').filter(Boolean);

  section(`Commits to merge from "${sourceBranch}"`);
  if (commits.length === 0) {
    info('No new commits to merge.');
    return;
  }
  commits.forEach((c) => console.log('  ' + c));
  blank();

  const confirmed =
    opts.yes || opts.dryRun
      ? true
      : await confirmPrompt(`Merge "${sourceBranch}" into "${currentBranch}"?`);
  if (!confirmed) {
    info('Merge cancelled.');
    return;
  }

  const strategy = opts.yes
    ? 'Merge commit    — preserva toda la historia'
    : await selectPrompt('¿Estrategia de merge?', [
        'Merge commit    — preserva toda la historia',
        'Squash merge    — aplasta los commits en uno',
        'Rebase          — reaplica commits sobre la base',
      ]);

  if (opts.dryRun) {
    info(`[DRY RUN] Would run: git merge ${sourceBranch}`);
    info(`[DRY RUN] ${commits.length} commit(s) would be merged into "${currentBranch}".`);
    info(`[DRY RUN] Strategy: ${strategy}`);
    return;
  }

  if (strategy.startsWith('Squash')) {
    const squashResult = spawnSync('git', ['merge', '--squash', sourceBranch], {
      cwd,
      stdio: 'inherit',
    });
    if (squashResult.status === 0) {
      info('Cambios staged. Escribe el mensaje del commit de squash:');
      const { guidedMessageBuilder } = await import('./commit.js');
      const msg = await guidedMessageBuilder();
      if (!msg) {
        info('Merge squash cancelado.');
        return;
      }
      spawnSync('git', ['commit', '-m', msg], { cwd, stdio: 'inherit' });
      success(`Squash merge de "${sourceBranch}" completado.`);
    }
  } else if (strategy.startsWith('Rebase')) {
    const rebaseResult = spawnSync('git', ['rebase', sourceBranch], { cwd, stdio: 'inherit' });
    if (rebaseResult.status !== 0) {
      warning('Rebase en conflicto. Resuelve los conflictos y ejecuta "git rebase --continue".');
      warning('Para abortar: git rebase --abort');
    } else {
      success(`Rebase sobre "${sourceBranch}" completado.`);
    }
  } else {
    const mergeResult = spawnSync('git', ['merge', sourceBranch], { cwd, stdio: 'inherit' });
    if (hasMergeConflicts(cwd)) {
      warning('Merge conflicts detected. Resolve them and run "git commit" to finish.');
      const conflictResult = spawnSync('git', ['diff', '--name-only', '--diff-filter=U'], {
        cwd,
        encoding: 'utf-8',
      });
      const conflicted = (conflictResult.stdout ?? '').split('\n').filter(Boolean);
      section('Conflicted files');
      conflicted.forEach((f) => console.log('  ' + f));
    } else if (mergeResult.status === 0) {
      success(`Merge of "${sourceBranch}" completed.`);
    } else {
      error('git merge failed.');
    }
  }
}
