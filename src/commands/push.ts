import { execSync } from 'child_process';
import { getConfig } from '../config/config.js';
import { ensureGitRepo } from '../git/ensure-repo.js';
import {
  getCurrentBranch,
  getUnstagedFiles,
  getUpstream,
  getAheadBehindCount,
  isProtectedBranch,
} from '../git/repo.js';
import { blank, error, info, keyValue, section, success, warning } from '../ux/display.js';
import { confirmPrompt } from '../ux/prompt.js';

export async function runPush(): Promise<void> {
  const cwd = process.cwd();

  if (!await ensureGitRepo(cwd)) return;

  const config = getConfig();
  const branch = getCurrentBranch(cwd);

  if (isProtectedBranch(branch, config.git.protectedBranches)) {
    warning(`Pushing to protected branch: "${branch}"`);
    const proceed = await confirmPrompt('Are you sure?', false);
    if (!proceed) { info('Push cancelled.'); return; }
  }

  const upstream = getUpstream(cwd);
  const { ahead, behind } = upstream ? getAheadBehindCount(upstream, cwd) : { ahead: 0, behind: 0 };

  section('Push Summary');
  keyValue('Branch', branch);
  keyValue('Upstream', upstream ?? 'not set');
  keyValue('Commits to push', String(ahead));
  if (behind > 0) warning(`Behind upstream by ${behind} commit(s) — consider pulling first`);
  blank();

  if (ahead === 0 && upstream) {
    info('Nothing to push — already up to date.');
    return;
  }

  const confirmed = await confirmPrompt(`Push branch "${branch}" to remote?`);
  if (!confirmed) { info('Push cancelled.'); return; }

  try {
    const pushArgs = upstream ? '' : '--set-upstream origin ' + branch;
    execSync(`git push ${pushArgs}`.trim(), { cwd, stdio: 'inherit' });
    success('Push completed.');
  } catch {
    error('git push failed.');
    process.exit(1);
  }
}
