import { readFileSync } from 'fs';
import { join } from 'path';
import { getConfig } from '../config/config.js';
import { buildAIContext } from '../git/ai-context-builder.js';
import { detectConvention } from '../git/convention-detector.js';
import { ensureGitRepo } from '../git/ensure-repo.js';
import {
  buildRepoContext,
  getCurrentBranch,
  getRepoName,
  getStagedFiles,
  getUnstagedFiles,
  getUntrackedFiles,
  getUpstream,
} from '../git/repo.js';
import { blank, divider, keyValue, section } from '../ux/display.js';

export async function runInfo(): Promise<void> {
  const cwd = process.cwd();

  if (!await ensureGitRepo(cwd)) return;

  const config = getConfig();
  const convention = await detectConvention(cwd);
  const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8')) as { version: string };

  const branch = getCurrentBranch(cwd);
  const repoName = getRepoName(cwd);
  const upstream = getUpstream(cwd);
  const staged = getStagedFiles(cwd);
  const unstaged = getUnstagedFiles(cwd);
  const untracked = getUntrackedFiles(cwd);

  section('Repository Context');
  keyValue('Repository', repoName);
  keyValue('Branch', branch);
  keyValue('Convention', `${convention.type}${convention.hasCommitlint ? ' (commitlint detected)' : ''}`);
  keyValue('Commitlint', convention.hasCommitlint ? 'detected' : 'not detected');
  keyValue('Husky', convention.hasHusky ? 'detected' : 'not detected');
  keyValue('AI Provider', config.ai.provider);
  keyValue('Upstream', upstream ?? 'none');
  blank();

  section('Staged Files');
  if (staged.length === 0) {
    keyValue('Status', 'none');
  } else {
    for (const f of staged) keyValue(f.status, f.path, 2);
  }
  blank();

  if (unstaged.length > 0) {
    section('Unstaged Files');
    for (const f of unstaged) keyValue('modified', f, 2);
    blank();
  }

  if (untracked.length > 0) {
    section('Untracked Files');
    for (const f of untracked) keyValue('untracked', f, 2);
    blank();
  }

  if (convention.allowedTypes.length > 0) {
    section('Allowed Commit Types');
    console.log('  ' + convention.allowedTypes.join(', '));
    blank();
  }

  divider();
  keyValue('git-smart-flow', `v${pkg.version}`);
}
