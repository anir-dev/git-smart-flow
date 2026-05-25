import type { JSX } from 'react';
import { spawnSync } from 'child_process';
import { getConfig } from '../config/config.js';
import { ensureGitRepo } from '../git/ensure-repo.js';
import { validateBranchName } from '../git/validate.js';
import {
  getCurrentBranch,
  getAheadBehindCount,
  getCommitsSinceBase,
  getUpstream,
  isProtectedBranch,
  listRemotes,
} from '../git/repo.js';
import { isCI } from '../ux/renderer.js';
import { blank, error, info, keyValue, section, success, warning } from '../ux/display.js';
import { confirmPrompt, inputPrompt, selectPrompt } from '../ux/prompt.js';

interface RunOptions {
  dryRun?: boolean;
  yes?: boolean;
}

async function resolveRemote(cwd: string): Promise<string> {
  const remotes = listRemotes(cwd);
  if (remotes.length <= 1) return remotes[0] ?? 'origin';
  return selectPrompt('¿Qué remoto usar?', remotes);
}

async function handleDivergedPush(
  branch: string,
  upstream: string | undefined,
  cwd: string,
  opts: RunOptions
): Promise<void> {
  warning('Tu rama local y el remoto han divergido.');
  info('Esto ocurre normalmente después de un rebase o de enmendar commits ya publicados.');
  blank();

  if (upstream) {
    const { ahead, behind } = getAheadBehindCount(upstream, cwd);
    keyValue('Commits locales no publicados', String(ahead));
    keyValue('Commits remotos no en local', String(behind));
  }
  blank();

  const action = await selectPrompt('¿Qué quieres hacer?', [
    'Force push (--force-with-lease)  — sobreescribir el remoto',
    'Cancelar — resolver manualmente',
  ]);

  if (!action.startsWith('Force')) {
    info('Push cancelado. Para resolver manualmente:');
    info('  git pull --rebase  — trae los cambios remotos y reaplica los tuyos');
    return;
  }

  warning('⚠  OPERACIÓN DESTRUCTIVA — Reescribirá la historia del remoto');
  warning('Esto puede afectar a otros colaboradores que tengan esta rama.');
  blank();

  const confirm = opts.yes
    ? branch
    : await inputPrompt(`Escribe el nombre de la rama para confirmar: "${branch}"`);

  if (confirm.trim() !== branch) {
    info('Confirmación incorrecta. Force push cancelado.');
    return;
  }

  const forceResult = spawnSync('git', ['push', '--force-with-lease'], {
    cwd,
    encoding: 'utf-8',
    stdio: 'pipe',
  });
  if (forceResult.status === 0) {
    success('Force push completado (--force-with-lease).');
  } else {
    error('Force push fallido:\n' + (forceResult.stderr ?? ''));
  }
}

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

  const choice = await renderInteractive<string>((resolve) =>
    React.createElement(PushUI, { onChoice: resolve })
  );

  if (choice !== 'push') {
    info('Push cancelado.');
    return;
  }

  const opts: RunOptions = {};
  try {
    const remote = upstream ? undefined : await resolveRemote(cwd);
    const pushArgs = remote ? ['--set-upstream', remote, branch] : [];
    const result = spawnSync('git', ['push', ...pushArgs], {
      cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    if (result.status === 0) {
      success('Push completado.');
    } else {
      const stderr = (result.stderr ?? '').toString();
      const isDiverged =
        stderr.includes('rejected') &&
        (stderr.includes('non-fast-forward') ||
          stderr.includes('fetch first') ||
          stderr.includes('Updates were rejected'));
      if (isDiverged) {
        await handleDivergedPush(branch, upstream, cwd, opts);
      } else {
        error('git push failed:\n' + stderr);
      }
    }
  } catch {
    error('git push failed.');
  }
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
    const remote = upstream ? undefined : await resolveRemote(cwd);
    const pushArgs = remote ? ['--set-upstream', remote, branch] : [];
    const result = spawnSync('git', ['push', ...pushArgs], {
      cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    if (result.status === 0) {
      success('Push completed.');
    } else {
      const stderr = (result.stderr ?? '').toString();
      const isDiverged =
        stderr.includes('rejected') &&
        (stderr.includes('non-fast-forward') ||
          stderr.includes('fetch first') ||
          stderr.includes('Updates were rejected'));
      if (isDiverged) {
        await handleDivergedPush(branch, upstream, cwd, opts);
      } else {
        error('git push failed:\n' + stderr);
      }
    }
  } catch {
    error('git push failed.');
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
