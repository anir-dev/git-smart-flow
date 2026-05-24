import type { JSX } from 'react';
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
import { isCI } from '../ux/renderer.js';
import { blank, divider, error, info, keyValue, section, success, warning } from '../ux/display.js';
import type { ValidationSection } from '../ux/components/ValidationReport.js';

async function gatherValidationData(
  cwd: string
): Promise<{ repoName: string; sections: ValidationSection[] }> {
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
  const isProtected = isProtectedBranch(branch, config.git.protectedBranches);

  const scanResult = scanFiles(
    staged.map((f) => ({ path: f.path })),
    config.security.blockedFiles
  );

  const sections: ValidationSection[] = [
    {
      title: 'Repositorio',
      items: [
        { status: 'ok', label: 'Git repo válido' },
        {
          status: isProtected ? 'warn' : 'ok',
          label: `Rama: ${branch}`,
          detail: isProtected ? '⚠ RAMA PROTEGIDA' : undefined,
        },
        {
          status: ticket ? 'ok' : config.commit.requireTicket === true ? 'error' : 'info',
          label: ticket ? `Ticket detectado: ${ticket}` : 'Sin ticket en la rama',
        },
        ...(ahead > 0
          ? [
              {
                status: 'warn' as const,
                label: `Ahead: ${ahead} commits`,
                detail: 'por delante de upstream',
              },
            ]
          : []),
        ...(behind > 0
          ? [
              {
                status: 'warn' as const,
                label: `Behind: ${behind} commits`,
                detail: 'por detrás de upstream',
              },
            ]
          : []),
      ],
    },
    {
      title: 'Convención de commits',
      items: [
        {
          status: convention.hasCommitlint ? 'ok' : 'info',
          label: convention.hasCommitlint ? 'Commitlint detectado' : 'Sin commitlint',
          detail: convention.hasCommitlint ? '@commitlint/config-conventional' : undefined,
        },
        {
          status: convention.hasHusky ? 'ok' : 'info',
          label: convention.hasHusky ? 'Husky hooks instalados' : 'Sin Husky',
        },
        {
          status: 'info',
          label: `Convención: ${convention.type}`,
        },
      ],
    },
    {
      title: 'Archivos',
      items: [
        {
          status: staged.length > 0 ? 'ok' : 'info',
          label: `Staged: ${staged.length} archivo(s)`,
        },
        ...(unstaged.length > 0
          ? [
              {
                status: 'warn' as const,
                label: `Unstaged: ${unstaged.length} archivo(s)`,
                detail: '(no se incluirán en el commit)',
              },
            ]
          : []),
        ...(untracked.length > 0
          ? [{ status: 'warn' as const, label: `Sin trackear: ${untracked.length} archivo(s)` }]
          : []),
        {
          status: scanResult.clean ? 'ok' : 'error',
          label: scanResult.clean
            ? 'Sin secretos detectados'
            : `Secretos detectados: ${scanResult.detectedSecrets.length}`,
        },
      ],
    },
    {
      title: 'Estado respecto a remote',
      items: upstream
        ? [
            { status: 'ok' as const, label: `Upstream: ${upstream}` },
            {
              status: conflicts ? 'error' : 'ok',
              label: conflicts ? '✖ Conflictos activos' : '✔ Sin conflictos de merge',
            },
          ]
        : [{ status: 'info' as const, label: 'Sin upstream configurado' }],
    },
  ];

  return { repoName, sections };
}

async function runInkValidate(cwd: string): Promise<void> {
  const React = (await import('react')).default;
  const { render } = await import('ink');
  const { ValidationReport } = await import('../ux/components/ValidationReport.js');

  const { repoName, sections } = await gatherValidationData(cwd);

  const { unmount } = render(
    React.createElement(ValidationReport, { repoName, sections }) as JSX.Element
  );
  await new Promise<void>((r) =>
    setImmediate(() => {
      unmount();
      r();
    })
  );
  console.log('');
}

async function runPlainValidate(cwd: string): Promise<void> {
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

  const isProtected = isProtectedBranch(branch, config.git.protectedBranches);
  if (isProtected) warning(`Branch "${branch}" is protected`);
  else success(`Branch: ${branch}`);

  if (ticket) success(`Ticket: ${ticket}`);
  else if (config.commit.requireTicket === true) error('No ticket found in branch name (required)');
  else info('No ticket in branch name');

  if (convention.hasCommitlint) success('Commitlint configuration detected');
  else info('No commitlint configuration found — using detected convention');

  if (staged.length > 0) success(`${staged.length} staged file(s)`);
  else info('No staged files');

  if (unstaged.length > 0) warning(`${unstaged.length} unstaged file(s): ${unstaged.join(', ')}`);
  if (untracked.length > 0) warning(`${untracked.length} untracked file(s) — not staged`);

  if (scanResult.clean) success('No security issues detected');
  else {
    if (scanResult.blockedFiles.length > 0)
      error(`Sensitive files staged: ${scanResult.blockedFiles.join(', ')}`);
    if (scanResult.detectedSecrets.length > 0)
      error(`Potential secrets detected: ${scanResult.detectedSecrets.length} occurrence(s)`);
  }

  if (conflicts) error('Active merge conflicts detected');
  else success('No merge conflicts');

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

export async function runValidate(): Promise<void> {
  const cwd = process.cwd();
  if (!(await ensureGitRepo(cwd))) return;

  if (isCI()) {
    await runPlainValidate(cwd);
  } else {
    await runInkValidate(cwd);
  }
}
