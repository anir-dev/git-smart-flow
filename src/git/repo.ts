import { spawnSync } from 'child_process';
import { existsSync, statSync } from 'fs';
import { join } from 'path';
import type { CommitConvention, RepoContext, StagedFile } from '../types/index.js';

function git(args: string[], cwd = process.cwd()): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf-8' });
  if (result.error) throw result.error;
  return (result.stdout || '').trim();
}

function gitSafe(args: string[], cwd = process.cwd()): string | null {
  try {
    return git(args, cwd);
  } catch {
    return null;
  }
}

export function isGitRepo(cwd = process.cwd()): boolean {
  const result = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], {
    cwd,
    encoding: 'utf-8',
  });
  return result.status === 0;
}

export function initRepo(cwd = process.cwd()): void {
  git(['init'], cwd);
}

export function hasCommits(cwd = process.cwd()): boolean {
  return spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf-8' }).status === 0;
}

export function unstageAll(cwd = process.cwd()): void {
  if (hasCommits(cwd)) {
    // Reset index to HEAD, keeping working tree changes
    spawnSync('git', ['reset', 'HEAD', '--', '.'], { cwd });
  } else {
    // No commits yet — remove everything from index without touching files
    spawnSync('git', ['rm', '--cached', '-r', '.'], { cwd });
  }
}

export function setDefaultBranch(name: string, cwd = process.cwd()): void {
  // Rename the just-created branch (before any commits, git branch -m works)
  spawnSync('git', ['symbolic-ref', 'HEAD', `refs/heads/${name}`], { cwd });
}

export function getGitUserConfig(cwd = process.cwd()): { name: string; email: string } {
  const name = gitSafe(['config', 'user.name'], cwd) ?? '';
  const email = gitSafe(['config', 'user.email'], cwd) ?? '';
  return { name, email };
}

export function setGitUserConfig(name: string, email: string, cwd = process.cwd()): void {
  git(['config', 'user.name', name], cwd);
  git(['config', 'user.email', email], cwd);
}

// ── Branch management ──────────────────────────────────────────────────────

export interface BranchInfo {
  name: string;
  current: boolean;
  remote: boolean;
  merged: boolean;
}

export function listBranches(includeRemote = false, cwd = process.cwd()): BranchInfo[] {
  const args = ['branch', '--format=%(refname:short)|%(HEAD)|%(upstream:short)'];
  if (includeRemote) args.push('-a');
  const output = gitSafe(args, cwd) ?? '';
  const current = getCurrentBranch(cwd);

  const mergedOutput = gitSafe(['branch', '--merged'], cwd) ?? '';
  const mergedBranches = new Set(
    mergedOutput.split('\n').map((b) => b.trim().replace(/^\*\s*/, ''))
  );

  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const name = line.split('|')[0] ?? '';
      const head = line.split('|')[1];
      const cleanName = name.replace(/^remotes\//, '');
      return {
        name: cleanName,
        current: head === '*' || cleanName === current,
        remote: name.startsWith('remotes/'),
        merged: mergedBranches.has(cleanName),
      };
    })
    .filter((b) => !b.name.endsWith('/HEAD'));
}

export function createBranch(name: string, baseBranch?: string, cwd = process.cwd()): void {
  if (baseBranch) {
    git(['checkout', '-b', name, baseBranch], cwd);
  } else {
    git(['checkout', '-b', name], cwd);
  }
}

export function switchBranch(name: string, cwd = process.cwd()): void {
  git(['checkout', name], cwd);
}

export function deleteBranch(name: string, force = false, cwd = process.cwd()): void {
  git(['branch', force ? '-D' : '-d', name], cwd);
}

export function deleteRemoteBranch(remote: string, name: string, cwd = process.cwd()): void {
  git(['push', remote, '--delete', name], cwd);
}

export function renameBranch(newName: string, cwd = process.cwd()): void {
  git(['branch', '-m', newName], cwd);
}

export function branchExists(name: string, cwd = process.cwd()): boolean {
  const result = spawnSync('git', ['rev-parse', '--verify', name], { cwd, encoding: 'utf-8' });
  return result.status === 0;
}

export function getRepoName(cwd = process.cwd()): string {
  const remote = gitSafe(['remote', 'get-url', 'origin'], cwd);
  if (remote) {
    const match = remote.match(/\/([^/]+?)(?:\.git)?$/);
    if (match) return match[1] ?? 'unknown';
  }
  const topLevel = gitSafe(['rev-parse', '--show-toplevel'], cwd);
  if (topLevel) return topLevel.split('/').pop() ?? 'unknown';
  return 'unknown';
}

export function getCurrentBranch(cwd = process.cwd()): string {
  // symbolic-ref works even before the first commit (rev-parse returns "HEAD" then)
  const symbolic = gitSafe(['symbolic-ref', '--short', 'HEAD'], cwd);
  if (symbolic) return symbolic;
  return gitSafe(['rev-parse', '--abbrev-ref', 'HEAD'], cwd) ?? 'HEAD';
}

export function isProtectedBranch(branch: string, protectedBranches: string[]): boolean {
  return protectedBranches.includes(branch);
}

export function extractTicketFromBranch(branch: string, ticketPattern: string): string | undefined {
  let regex: RegExp;
  try {
    regex = new RegExp(ticketPattern);
  } catch {
    // Invalid pattern from user config — skip silently rather than crash.
    return undefined;
  }
  const match = branch.match(regex);
  return match ? match[0] : undefined;
}

export function getStagedFiles(cwd = process.cwd()): StagedFile[] {
  const output = gitSafe(['diff', '--cached', '--name-status'], cwd);
  if (!output) return [];
  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('\t');
      const statusChar = parts[0] ?? '';
      const path = parts[parts.length - 1] ?? '';
      return { path, status: parseStatus(statusChar.charAt(0)) };
    });
}

export function getUnstagedFiles(cwd = process.cwd()): string[] {
  const output = gitSafe(['diff', '--name-only'], cwd);
  if (!output) return [];
  return output.split('\n').filter(Boolean);
}

export function getUntrackedFiles(cwd = process.cwd()): string[] {
  const output = gitSafe(['ls-files', '--others', '--exclude-standard'], cwd);
  if (!output) return [];
  return output.split('\n').filter(Boolean);
}

export function getStagedDiff(cwd = process.cwd()): string {
  return gitSafe(['diff', '--cached'], cwd) ?? '';
}

export interface LastCommit {
  shortSha: string;
  message: string;
  author: string;
  ago: string;
}

export function getLastCommit(cwd = process.cwd()): LastCommit | null {
  const out = gitSafe(['log', '-1', '--format=%h\x1f%s\x1f%an\x1f%ar'], cwd);
  if (!out) return null;
  const [shortSha, message, author, ago] = out.split('\x1f');
  return { shortSha: shortSha ?? '', message: message ?? '', author: author ?? '', ago: ago ?? '' };
}

export function fetchRemote(cwd = process.cwd()): { ok: boolean; output: string } {
  const r = spawnSync('git', ['fetch'], { cwd, encoding: 'utf-8', timeout: 15000 });
  return { ok: r.status === 0, output: ((r.stdout ?? '') + (r.stderr ?? '')).trim() };
}

export function getLastFetchTime(cwd = process.cwd()): Date | null {
  try {
    const p = join(cwd, '.git', 'FETCH_HEAD');
    return existsSync(p) ? statSync(p).mtime : null;
  } catch {
    return null;
  }
}

export function getCommitsSinceBase(base: string, cwd = process.cwd()): string[] {
  const output = gitSafe(['log', `${base}..HEAD`, '--oneline'], cwd);
  if (!output) return [];
  return output.split('\n').filter(Boolean);
}

export function getUpstream(cwd = process.cwd()): string | undefined {
  const upstream = gitSafe(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], cwd);
  return upstream ?? undefined;
}

export function getAheadBehindCount(
  upstream: string,
  cwd = process.cwd()
): { ahead: number; behind: number } {
  const output = gitSafe(['rev-list', '--left-right', '--count', `${upstream}...HEAD`], cwd);
  if (!output) return { ahead: 0, behind: 0 };
  const [behind, ahead] = output.split('\t').map(Number);
  return { ahead: ahead ?? 0, behind: behind ?? 0 };
}

export function hasMergeConflicts(cwd = process.cwd()): boolean {
  const output = gitSafe(['diff', '--name-only', '--diff-filter=U'], cwd);
  return !!(output && output.trim().length > 0);
}

export function hasUncommittedChanges(cwd = process.cwd()): boolean {
  const output = gitSafe(['status', '--porcelain'], cwd);
  return !!(output && output.trim().length > 0);
}

export function stageFile(filePath: string, cwd = process.cwd()): void {
  git(['add', filePath], cwd);
}

export function stageFiles(paths: string[], cwd = process.cwd()): void {
  if (paths.length === 0) return;
  git(['add', '--', ...paths], cwd);
}

export function buildRepoContext(
  protectedBranches: string[],
  ticketPattern: string,
  convention: CommitConvention,
  cwd = process.cwd()
): RepoContext {
  const branch = getCurrentBranch(cwd);
  const upstream = getUpstream(cwd);
  const staged = getStagedFiles(cwd);
  const unstaged = getUnstagedFiles(cwd);
  const untracked = getUntrackedFiles(cwd);
  const { ahead, behind } = upstream ? getAheadBehindCount(upstream, cwd) : { ahead: 0, behind: 0 };

  return {
    name: getRepoName(cwd),
    branch,
    ticket: extractTicketFromBranch(branch, ticketPattern),
    convention,
    isMonorepo: false,
    upstream,
    hasUncommittedChanges: hasUncommittedChanges(cwd),
    stagedFiles: staged,
    unstagedFiles: unstaged,
    untrackedFiles: untracked,
    conflictsActive: hasMergeConflicts(cwd),
    aheadCount: ahead,
    behindCount: behind,
  };
}

export function refExists(ref: string, cwd = process.cwd()): boolean {
  return gitSafe(['rev-parse', '--verify', ref], cwd) !== null;
}

export function stashSave(message: string, cwd = process.cwd()): void {
  git(['stash', 'push', '-m', message], cwd);
}

export function stashPop(cwd = process.cwd()): void {
  git(['stash', 'pop'], cwd);
}

export interface StashEntry {
  index: number;
  ref: string;
  message: string;
  ago: string;
}

export function stashList(cwd = process.cwd()): StashEntry[] {
  const out = gitSafe(['stash', 'list', '--format=%gd\x1f%s\x1f%ar'], cwd) ?? '';
  if (!out) return [];
  return out
    .split('\n')
    .filter(Boolean)
    .map((line, index) => {
      const [ref, message, ago] = line.split('\x1f');
      return {
        index,
        ref: ref ?? `stash@{${index}}`,
        message: message ?? 'Sin título',
        ago: ago ?? '',
      };
    });
}

export function stashApplyRef(ref: string, cwd = process.cwd()): void {
  git(['stash', 'apply', ref], cwd);
}

export function stashPopRef(ref: string, cwd = process.cwd()): void {
  git(['stash', 'pop', ref], cwd);
}

export function stashDropRef(ref: string, cwd = process.cwd()): void {
  git(['stash', 'drop', ref], cwd);
}

export function resetHard(ref: string, cwd = process.cwd()): void {
  git(['reset', '--hard', ref], cwd);
}

export function detectGhCli(): boolean {
  const result = spawnSync('gh', ['auth', 'status'], { encoding: 'utf-8', stdio: 'pipe' });
  return result.status === 0;
}

export function autoFetchIfStale(thresholdMinutes: number, cwd = process.cwd()): void {
  const lastFetch = getLastFetchTime(cwd);
  if (!lastFetch) {
    spawnSync('git', ['fetch', '--quiet', '--prune'], { cwd, stdio: 'pipe', timeout: 10000 });
    return;
  }
  const ageMinutes = (Date.now() - lastFetch.getTime()) / 60000;
  if (ageMinutes >= thresholdMinutes) {
    spawnSync('git', ['fetch', '--quiet', '--prune'], { cwd, stdio: 'pipe', timeout: 10000 });
  }
}

function parseStatus(char: string): StagedFile['status'] {
  const map: Record<string, StagedFile['status']> = {
    A: 'added',
    M: 'modified',
    D: 'deleted',
    R: 'renamed',
    C: 'copied',
  };
  return map[char] ?? 'unknown';
}
