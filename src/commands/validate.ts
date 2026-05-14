import { getConfig } from '../config/config.js';
import { detectConvention } from '../git/convention-detector.js';
import { ensureGitRepo } from '../git/ensure-repo.js';
import {
  extractTicketFromBranch,
  getAheadBehindCount,
  getCurrentBranch,
  getRepoName,
  getStagedFiles,
  getUnstagedFiles,
  getUntrackedFiles,
  getUpstream,
  hasMergeConflicts,
  isProtectedBranch,
} from '../git/repo.js';
import { scanFiles } from '../security/scanner.js';
import { blank, divider, error, info, keyValue, section, success, warning } from '../ux/display.js';

export async function runValidate(): Promise<void> {
  const cwd = process.cwd();

  if (!await ensureGitRepo(cwd)) return;

  const config = getConfig();
  const convention = await detectConvention(cwd);
  const branch = getCurrentBranch(cwd);
  const repoName = getRepoName(cwd);
  const upstream = getUpstream(cwd);
  const staged = getStagedFiles(cwd);
  const unstaged = getUnstagedFiles(cwd);
  const untracked = getUntrackedFiles(cwd);
  const ticket = extractTicketFromBranch(branch, config.commit.ticketPattern);
  const conflicts = hasMergeConflicts(cwd);
  const { ahead, behind } = upstream ? getAheadBehindCount(upstream, cwd) : { ahead: 0, behind: 0 };

  const scanResult = scanFiles(
    staged.map((f) => ({ path: f.path })),
    config.security.blockedFiles
  );

  section('Validation Report');
  keyValue('Repository', repoName);
  blank();

  // Branch
  const isProtected = isProtectedBranch(branch, config.git.protectedBranches);
  if (isProtected) {
    warning(`Branch "${branch}" is protected`);
  } else {
    success(`Branch: ${branch}`);
  }

  // Ticket
  if (ticket) {
    success(`Ticket: ${ticket}`);
  } else if (config.commit.requireTicket === true) {
    error('No ticket found in branch name (required)');
  } else {
    info('No ticket in branch name');
  }

  // Commitlint
  if (convention.hasCommitlint) {
    success('Commitlint configuration detected');
  } else {
    info('No commitlint configuration found — using detected convention');
  }

  // Staged files
  if (staged.length > 0) {
    success(`${staged.length} staged file(s)`);
  } else {
    info('No staged files');
  }

  // Unstaged files
  if (unstaged.length > 0) {
    warning(`${unstaged.length} unstaged file(s): ${unstaged.join(', ')}`);
  }

  // Untracked files
  if (untracked.length > 0) {
    warning(`${untracked.length} untracked file(s) — not staged: ${untracked.slice(0, 5).join(', ')}${untracked.length > 5 ? ` (+${untracked.length - 5} more)` : ''}`);
  }

  // Security
  if (scanResult.clean) {
    success('No security issues detected');
  } else {
    if (scanResult.blockedFiles.length > 0) {
      error(`Sensitive files staged: ${scanResult.blockedFiles.join(', ')}`);
    }
    if (scanResult.detectedSecrets.length > 0) {
      error(`Potential secrets detected: ${scanResult.detectedSecrets.length} occurrence(s)`);
    }
  }

  // Conflicts
  if (conflicts) {
    error('Active merge conflicts detected');
  } else {
    success('No merge conflicts');
  }

  // Upstream
  if (upstream) {
    success(`Upstream: ${upstream}`);
    if (behind > 0) warning(`Behind upstream by ${behind} commit(s) — consider pulling`);
    if (ahead > 0) info(`Ahead of upstream by ${ahead} commit(s)`);
  } else {
    info('No upstream configured');
  }

  blank();
  divider();
}
