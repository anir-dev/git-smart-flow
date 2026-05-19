import { execSync } from 'child_process';
import { getConfig } from '../config/config.js';
import { ensureGitRepo } from '../git/ensure-repo.js';
import { validateBranchName } from '../git/validate.js';
import {
  getCurrentBranch,
  getAheadBehindCount,
  getCommitsSinceBase,
  getUpstream,
  isProtectedBranch,
} from '../git/repo.js';
import { isCI } from '../ux/renderer.js';
import { blank, error, info, keyValue, section, success, warning } from '../ux/display.js';
import { confirmPrompt } from '../ux/prompt.js';

async function runInkPush(): Promise<void> {
  const React = (await import('react')).default;
  const { Box, Text } = await import('ink');
  const { Select } = await import('@inkjs/ui');
  const { renderInteractive } = await import('../ux/renderer.js');
  const { theme } = await import('../ux/theme.js');
  await import('../ux/components/WarningBox.js');

  const cwd = process.cwd();
  const config = getConfig();
  const branch = getCurrentBranch(cwd);
  const branchCheck = validateBranchName(branch);
  if (!branchCheck.valid) {
    error(`Invalid branch name: ${branchCheck.reason}`);
    return;
  }
  const upstream = getUpstream(cwd);
  const { ahead, behind } = upstream ? getAheadBehindCount(upstream, cwd) : { ahead: 0, behind: 0 };
  const isProtected = isProtectedBranch(branch, config.git.protectedBranches);

  // Get recent commits to show
  const recentCommits = upstream ? getCommitsSinceBase(upstream, cwd).slice(0, 5) : [];

  if (ahead === 0 && upstream) {
    section('Push');
    info('Nothing to push — already up to date.');
    return;
  }

  const options = [
    {
      label: isProtected ? '⚠️  Sí, hacer push (rama protegida)' : 'Sí, hacer push',
      value: 'push',
    },
    { label: 'Cancelar', value: 'cancel' },
  ];

  const { useState, useEffect } = await import('react');

  function PushUI({ onChoice }: { onChoice: (val: string) => void }): JSX.Element {
    const [active, setActive] = useState(false);
    useEffect(() => {
      const t = setTimeout(() => setActive(true), 120);
      return () => clearTimeout(t);
    }, []);
    const width = Math.min(process.stdout.columns ?? 80, 60);
    return React.createElement(
      Box,
      { flexDirection: 'column', paddingX: 1, width },
      React.createElement(Text, { bold: true, color: 'white' }, 'Push validado'),
      React.createElement(Text, { color: theme.muted }, '━'.repeat(Math.min(width - 4, 40))),
      React.createElement(Text, null),

      // Summary box
      React.createElement(
        Box,
        {
          flexDirection: 'column',
          borderStyle: 'round' as const,
          borderColor: isProtected ? theme.warning : theme.border,
          paddingX: 1,
          marginBottom: 1,
          width: width - 2,
        },
        React.createElement(
          Text,
          null,
          React.createElement(Text, { color: theme.muted }, 'Rama:      '),
          React.createElement(Text, { color: 'white' }, branch),
          isProtected ? React.createElement(Text, { color: theme.warning }, '  ⚠ PROTECTED') : null
        ),
        React.createElement(
          Text,
          null,
          React.createElement(Text, { color: theme.muted }, 'Destino:   '),
          React.createElement(Text, { color: 'white' }, upstream ?? `origin/${branch}`)
        ),
        React.createElement(
          Text,
          null,
          React.createElement(Text, { color: theme.muted }, 'Commits:   '),
          React.createElement(
            Text,
            { color: ahead > 0 ? theme.info : theme.muted },
            `${ahead} commits pendientes`
          )
        ),
        behind > 0
          ? React.createElement(
              Text,
              { color: theme.warning },
              `  ⚠ Behind por ${behind} commits — considera pull primero`
            )
          : null
      ),

      // Commit list
      recentCommits.length > 0
        ? React.createElement(
            Box,
            { flexDirection: 'column', marginBottom: 1 },
            ...recentCommits.map((c, i) =>
              React.createElement(Text, { key: i, color: theme.muted }, `  ● ${c}`)
            )
          )
        : null,

      React.createElement(Text, { bold: true, color: 'white' }, '¿Confirmas el push?'),
      React.createElement(Text, null),
      React.createElement(Select, { isDisabled: !active, options, onChange: onChoice })
    );
  }

  const choice = await renderInteractive<string>(
    (resolve) => React.createElement(PushUI, { onChoice: resolve }) as JSX.Element
  );

  if (choice !== 'push') {
    info('Push cancelado.');
    return;
  }

  try {
    const pushArgs = upstream ? '' : `--set-upstream origin ${branch}`;
    execSync(`git push ${pushArgs}`.trim(), { cwd, stdio: 'inherit' });
    success('Push completado.');
  } catch {
    error('git push failed.');
    process.exit(1);
  }
}

interface RunOptions {
  dryRun?: boolean;
  yes?: boolean;
}

async function runPlainPush(opts: RunOptions = {}): Promise<void> {
  const cwd = process.cwd();
  const config = getConfig();
  const branch = getCurrentBranch(cwd);
  const branchCheck = validateBranchName(branch);
  if (!branchCheck.valid) {
    error(`Invalid branch name: ${branchCheck.reason}`);
    return;
  }

  if (isProtectedBranch(branch, config.git.protectedBranches)) {
    warning(`Pushing to protected branch: "${branch}"`);
    const proceed = opts.yes || opts.dryRun ? true : await confirmPrompt('Are you sure?', false);
    if (!proceed) {
      info('Push cancelled.');
      return;
    }
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

  if (opts.dryRun) {
    const dest = upstream ?? `origin/${branch}`;
    info(`[DRY RUN] Would push ${ahead} commit(s) from "${branch}" to "${dest}".`);
    return;
  }

  const confirmed = opts.yes ? true : await confirmPrompt(`Push branch "${branch}" to remote?`);
  if (!confirmed) {
    info('Push cancelled.');
    return;
  }

  try {
    const pushArgs = upstream ? '' : '--set-upstream origin ' + branch;
    execSync(`git push ${pushArgs}`.trim(), { cwd, stdio: 'inherit' });
    success('Push completed.');
  } catch {
    error('git push failed.');
    process.exit(1);
  }
}

export async function runPush(opts: RunOptions = {}): Promise<void> {
  const cwd = process.cwd();
  if (!(await ensureGitRepo(cwd))) return;

  if (opts.dryRun) info('[DRY RUN] No changes will be made.\n');

  if (isCI() || opts.dryRun || opts.yes) {
    await runPlainPush(opts);
  } else {
    await runInkPush();
  }
}
