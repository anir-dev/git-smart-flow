import { execSync, spawnSync } from 'child_process';
import { getConfig } from '../config/config.js';
import { buildAIContext } from '../git/ai-context-builder.js';
import { detectConvention } from '../git/convention-detector.js';
import { ensureGitRepo } from '../git/ensure-repo.js';
import {
  extractTicketFromBranch,
  getAheadBehindCount,
  getCurrentBranch,
  getLastCommit,
  getRepoName,
  getStagedFiles,
  getUnstagedFiles,
  getUntrackedFiles,
  getUpstream,
  hasCommits,
  isProtectedBranch,
  stageFiles,
  unstageAll,
} from '../git/repo.js';
import { scanFiles } from '../security/scanner.js';
import { createProviderWithFallback } from '../providers/provider.factory.js';
import { blank, error, info, keyValue, section, success, warning } from '../ux/display.js';
import { confirmPrompt, inputPrompt, selectPrompt, smartFileSelectPrompt } from '../ux/prompt.js';
import { failSpinner, startSpinner, succeedSpinner } from '../ux/spinner.js';
import { isCI } from '../ux/renderer.js';

// ── Conventional commit types ──────────────────────────────────────────────

const TYPE_OPTIONS = [
  { type: 'feat', label: 'feat      — new feature or enhancement' },
  { type: 'fix', label: 'fix       — bug fix' },
  { type: 'docs', label: 'docs      — documentation only' },
  { type: 'style', label: 'style     — formatting, no logic change' },
  { type: 'refactor', label: 'refactor  — code restructuring, no feature/fix' },
  { type: 'test', label: 'test      — adding or correcting tests' },
  { type: 'chore', label: 'chore     — maintenance, tooling, dependencies' },
  { type: 'ci', label: 'ci        — CI/CD configuration' },
  { type: 'perf', label: 'perf      — performance improvement' },
  { type: 'build', label: 'build     — build system or external deps' },
  { type: 'revert', label: 'revert    — revert a previous commit' },
];

function parseConventionalMessage(msg: string): {
  type: string;
  scope: string;
  desc: string;
  body: string;
  breaking: boolean;
} {
  const match = msg.match(/^(\w+)(?:\(([^)]*)\))?(!)?\s*:\s*(.+)/);
  if (match) {
    const [, type = 'feat', scope = '', excl, desc = ''] = match;
    const lines = msg.split('\n');
    const body = lines
      .slice(1)
      .join('\n')
      .replace(/BREAKING CHANGE:.*/gs, '')
      .trim();
    return {
      type,
      scope,
      desc: desc.trim(),
      body,
      breaking: !!excl || /BREAKING CHANGE:/m.test(msg),
    };
  }
  return { type: 'feat', scope: '', desc: msg.trim(), body: '', breaking: false };
}

export async function guidedMessageBuilder(current?: string): Promise<string | null> {
  section('Commit Message Builder');
  const pre = current
    ? parseConventionalMessage(current)
    : { type: 'feat', scope: '', desc: '', body: '', breaking: false };

  const typeLabels = TYPE_OPTIONS.map((t) => t.label);
  const typeChoice = await selectPrompt('Commit type:', typeLabels);
  const matchedType = TYPE_OPTIONS.find((t) => typeChoice.startsWith(t.type));
  const type = matchedType?.type ?? pre.type;

  const scope = await inputPrompt('Scope (optional — e.g. "auth", "api")', pre.scope || undefined);
  const desc = await inputPrompt('Short description (imperative)', pre.desc || undefined);
  if (!desc.trim()) {
    info('Cancelled — no description provided.');
    return null;
  }

  const body = await inputPrompt('Body (optional — press Enter to skip)', pre.body || undefined);
  const isBreaking = await confirmPrompt('Is this a breaking change?', false);
  let breakingNote = '';
  if (isBreaking) {
    breakingNote = await inputPrompt('Describe the breaking change');
  }

  const header = `${type}${scope.trim() ? `(${scope.trim()})` : ''}${isBreaking ? '!' : ''}: ${desc.trim()}`;
  const parts: string[] = [header];
  if (body.trim()) parts.push('\n' + body.trim());
  if (isBreaking && breakingNote.trim()) parts.push('\nBREAKING CHANGE: ' + breakingNote.trim());

  return parts.join('\n');
}

// ── Amend last commit flow ─────────────────────────────────────────────────

async function amendFlow(cwd: string): Promise<void> {
  const lastCommit = getLastCommit(cwd);
  if (!lastCommit) {
    info('No hay commits anteriores para enmendar.');
    return;
  }

  const upstream = getUpstream(cwd);
  if (upstream) {
    const { ahead } = getAheadBehindCount(upstream, cwd);
    if (ahead === 0) {
      warning('⚠️  Este commit ya está publicado en el remoto.');
      console.log('  Enmendarlo reescribirá la historia y requerirá --force-with-lease.');
      const proceed = await confirmPrompt('¿Continuar de todas formas?', false);
      if (!proceed) {
        info('Amend cancelado.');
        return;
      }
    }
  }

  section(`Último commit: ${lastCommit.shortSha} — ${lastCommit.message}`);

  const amendChoice = await selectPrompt('¿Qué quieres enmendar?', [
    'Solo el mensaje del commit',
    'Añadir ficheros staged + cambiar mensaje',
    'Solo añadir ficheros staged (mantener mensaje)',
    'Cancelar',
  ]);

  if (amendChoice === 'Cancelar') {
    info('Amend cancelado.');
    return;
  }

  const changeMessage =
    amendChoice === 'Solo el mensaje del commit' ||
    amendChoice === 'Añadir ficheros staged + cambiar mensaje';
  const addFiles =
    amendChoice === 'Añadir ficheros staged + cambiar mensaje' ||
    amendChoice === 'Solo añadir ficheros staged (mantener mensaje)';

  if (addFiles) {
    const unstaged = getUnstagedFiles(cwd);
    const untracked = getUntrackedFiles(cwd);
    const available = [...unstaged, ...untracked];
    if (available.length === 0) {
      info('No hay ficheros sin stagear para añadir.');
      if (!changeMessage) return;
    } else {
      const toStage = await smartFileSelectPrompt(
        'Selecciona ficheros para añadir al amend',
        available
      );
      if (toStage.length > 0) {
        stageFiles(toStage, cwd);
      }
    }
  }

  if (changeMessage) {
    const newMessage = await guidedMessageBuilder(lastCommit.message);
    if (!newMessage) {
      info('Amend cancelado — no se proporcionó mensaje.');
      return;
    }
    const result = spawnSync('git', ['commit', '--amend', '-m', newMessage], {
      cwd,
      stdio: 'inherit',
    });
    if (result.status !== 0) {
      error('git commit --amend falló.');
      return;
    }
  } else {
    const result = spawnSync('git', ['commit', '--amend', '--no-edit'], { cwd, stdio: 'inherit' });
    if (result.status !== 0) {
      error('git commit --amend falló.');
      return;
    }
  }

  success('Commit enmendado correctamente.');
}

// ── Ink-based commit flow (TTY) ────────────────────────────────────────────

async function runInkCommit(): Promise<void> {
  const React = (await import('react')).default;
  const { useState, useEffect } = await import('react');
  const { Box, Text, useApp } = await import('ink');
  const { Spinner } = await import('@inkjs/ui');
  const { renderInteractive } = await import('../ux/renderer.js');
  const { CommitProposalView } = await import('../ux/components/CommitProposal.js');
  const { FileSelector } = await import('../ux/components/FileSelector.js');
  const { SecurityAlert } = await import('../ux/components/SecurityAlert.js');
  const { SuccessBox } = await import('../ux/components/SuccessBox.js');
  const { ErrorBox } = await import('../ux/components/ErrorBox.js');
  const { WarningBox } = await import('../ux/components/WarningBox.js');
  const { theme } = await import('../ux/theme.js');

  const cwd = process.cwd();
  const config = getConfig();
  const convention = await detectConvention(cwd);
  const branch = getCurrentBranch(cwd);
  const repoName = getRepoName(cwd);
  const ticket = extractTicketFromBranch(branch, config.commit.ticketPattern);
  const VALID_COMMIT_TYPES = new Set([
    'feat',
    'fix',
    'docs',
    'style',
    'refactor',
    'test',
    'chore',
    'ci',
    'perf',
    'build',
    'revert',
  ]);
  const branchPrefix = branch.split('/')[0] ?? '';
  const branchType = VALID_COMMIT_TYPES.has(branchPrefix) ? branchPrefix : undefined;

  type Phase =
    | 'check-protected'
    | 'file-select'
    | 'security-alert'
    | 'generating'
    | 'proposal'
    | 'committing'
    | 'success'
    | 'error'
    | 'cancelled';

  interface State {
    phase: Phase;
    staged: ReturnType<typeof getStagedFiles>;
    message: string;
    errorMsg: string;
    commitSha: string;
  }

  const isProtected = isProtectedBranch(branch, config.git.protectedBranches);
  const initialPhase: Phase = isProtected ? 'check-protected' : 'file-select';
  const initialStaged = getStagedFiles(cwd);

  function CommitFlow({ onDone }: { onDone: () => void }): JSX.Element {
    const { exit } = useApp();
    const [state, setState] = useState<State>({
      phase: initialPhase,
      staged: initialStaged,
      message: '',
      errorMsg: '',
      commitSha: '',
    });

    const finish = (): void => {
      exit();
      onDone();
    };

    // Generate message when entering 'generating' phase
    useEffect(() => {
      if (state.phase !== 'generating') return;
      let cancelled = false;

      void (async () => {
        try {
          const provider = await createProviderWithFallback(config);
          const aiContext = buildAIContext({
            repoName,
            branch,
            ticket,
            convention,
            stagedFiles: state.staged,
            allowRawDiff: config.ai.allowRawDiff,
          });
          const msg = await provider.generateCommitMessage(aiContext);
          if (!cancelled) setState((s) => ({ ...s, phase: 'proposal', message: msg }));
        } catch {
          if (!cancelled)
            setState((s) => ({
              ...s,
              phase: 'proposal',
              message: `feat: update ${state.staged.map((f) => f.path.split('/').pop()).join(', ')}`,
            }));
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [state.phase]);

    // Execute commit when entering 'committing' phase
    useEffect(() => {
      if (state.phase !== 'committing') return;
      try {
        execSync(`git commit -m ${JSON.stringify(state.message)}`, { cwd });
        const sha = execSync('git rev-parse --short HEAD', { cwd }).toString().trim();
        setState((s) => ({ ...s, phase: 'success', commitSha: sha }));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setState((s) => ({ ...s, phase: 'error', errorMsg: msg }));
      }
    }, [state.phase]);

    if (state.phase === 'check-protected') {
      return React.createElement(
        Box,
        { flexDirection: 'column', paddingX: 1 },
        React.createElement(WarningBox, {
          title: '⚠️  Rama protegida',
          messages: [`Estás en la rama: ${branch}`, 'Los commits aquí afectan a producción.'],
        }),
        React.createElement(
          Box,
          { marginTop: 1 },
          React.createElement(Text, { color: theme.muted }, '¿Continuar? (S/n): ')
        )
      );
    }

    if (state.phase === 'file-select') {
      const unstaged = getUnstagedFiles(cwd);
      const untracked = getUntrackedFiles(cwd);
      const allFiles = [
        ...state.staged.map((f) => ({ path: f.path, status: f.status as 'added' })),
        ...unstaged.map((p) => ({ path: p, status: 'unstaged' as const })),
        ...untracked.map((p) => ({ path: p, status: 'untracked' as const })),
      ];

      if (allFiles.length === 0) {
        return React.createElement(
          Box,
          { paddingX: 1 },
          React.createElement(ErrorBox, {
            title: 'Sin cambios',
            messages: 'No hay archivos para commitear.',
          })
        );
      }

      return React.createElement(
        Box,
        { paddingX: 1 },
        React.createElement(FileSelector, {
          files: allFiles,
          blockedFiles: config.security.blockedFiles,
          onSelect: (paths) => {
            if (paths.length === 0) {
              finish();
              return;
            }
            stageFiles(paths, cwd);
            const newStaged = getStagedFiles(cwd);

            const scan = scanFiles(
              newStaged.map((f) => ({ path: f.path })),
              config.security.blockedFiles
            );
            if (!scan.clean && config.security.blockOnSecrets) {
              setState((s) => ({ ...s, staged: newStaged, phase: 'security-alert' }));
            } else {
              setState((s) => ({ ...s, staged: newStaged, phase: 'generating' }));
            }
          },
        })
      );
    }

    if (state.phase === 'security-alert') {
      const scan = scanFiles(
        state.staged.map((f) => ({ path: f.path })),
        config.security.blockedFiles
      );
      return React.createElement(
        Box,
        { paddingX: 1 },
        React.createElement(SecurityAlert, {
          scan,
          onChoice: (choice) => {
            if (choice === 'cancel' || choice === 'review') {
              finish();
              return;
            }
            setState((s) => ({ ...s, phase: 'generating' }));
          },
        })
      );
    }

    if (state.phase === 'generating') {
      return React.createElement(
        Box,
        { paddingX: 1, flexDirection: 'column' },
        React.createElement(Spinner, { label: `Analizando cambios con ${config.ai.provider}...` }),
        React.createElement(
          Text,
          { color: theme.muted },
          `  ${state.staged.length} archivo(s) staged`
        )
      );
    }

    if (state.phase === 'proposal') {
      const validation = {
        valid: true,
        errors: [] as string[],
        warnings: [] as string[],
      };
      const header = state.message.split('\n')[0] ?? '';
      if (header.length > convention.maxHeaderLength) {
        validation.warnings.push(
          `Header demasiado largo (${header.length}/${convention.maxHeaderLength})`
        );
      }

      const proposalObj = {
        message: state.message,
        validation,
        provider: config.ai.provider,
      };

      return React.createElement(
        Box,
        { paddingX: 1 },
        React.createElement(CommitProposalView, {
          key: state.message,
          proposal: proposalObj,
          stagedCount: state.staged.length,
          branchType,
          onAction: (action, extra) => {
            if (action === 'accept') {
              setState((s) => ({ ...s, phase: 'committing' }));
            } else if (action === 'edit') {
              if (extra) setState((s) => ({ ...s, message: extra, phase: 'proposal' }));
            } else if (action === 'regenerate') {
              setState((s) => ({ ...s, phase: 'generating' }));
            } else if (action === 'context') {
              // show AI context - for now just log
              console.log(
                '\n' +
                  JSON.stringify(
                    buildAIContext({
                      repoName,
                      branch,
                      ticket,
                      convention,
                      stagedFiles: state.staged,
                      allowRawDiff: config.ai.allowRawDiff,
                    }),
                    null,
                    2
                  )
              );
            } else {
              finish();
            }
          },
        })
      );
    }

    if (state.phase === 'committing') {
      return React.createElement(
        Box,
        { paddingX: 1 },
        React.createElement(Spinner, { label: 'Creando commit...' })
      );
    }

    if (state.phase === 'success') {
      return React.createElement(
        Box,
        { paddingX: 1, flexDirection: 'column' },
        React.createElement(SuccessBox, {
          title: '✅ Commit creado',
          messages: [
            state.message.split('\n')[0] ?? '',
            `${state.commitSha}  ·  ${ticket ?? branch}  ·  ahora`,
          ],
        }),
        React.createElement(
          Box,
          { marginTop: 1 },
          React.createElement(
            Text,
            { color: theme.muted },
            `  Ejecuta  gsf push  cuando estés listo.`
          )
        )
      );
    }

    if (state.phase === 'error') {
      return React.createElement(
        Box,
        { paddingX: 1 },
        React.createElement(ErrorBox, { title: 'Error al commitear', messages: state.errorMsg })
      );
    }

    return React.createElement(Box, null);
  }

  // Handle "check-protected" phase with a readline confirm since mixing ink select
  // with the protected-branch check is complex. Use plain confirm for this guard.
  if (isProtected) {
    warning(`Estás en una rama protegida: "${branch}"`);
    const { confirmPrompt: cp } = await import('../ux/prompt.js');
    const proceed = await cp('¿Seguro que quieres commitear aquí?', false);
    if (!proceed) {
      info('Commit cancelado.');
      return;
    }
  }

  // If there are no files whatsoever, offer amend before entering Ink
  {
    const unstaged = getUnstagedFiles(cwd);
    const untracked = getUntrackedFiles(cwd);
    if (initialStaged.length === 0 && unstaged.length === 0 && untracked.length === 0) {
      if (hasCommits(cwd)) {
        info('No hay ficheros staged.');
        blank();
        const noStagedChoice = await selectPrompt('¿Qué quieres hacer?', [
          'Seleccionar ficheros para nuevo commit',
          'Enmendar el último commit',
          'Cancelar',
        ]);
        if (noStagedChoice === 'Enmendar el último commit') {
          await amendFlow(cwd);
          return;
        }
        if (noStagedChoice === 'Cancelar') {
          info('Commit cancelado.');
          return;
        }
        info('No hay ficheros disponibles para stagear.');
        return;
      }
    }
  }

  await renderInteractive<void>(
    (resolve) => React.createElement(CommitFlow, { onDone: resolve }) as JSX.Element
  );
}

// ── Plain commit flow (CI / no-TTY) ───────────────────────────────────────

async function runPlainCommit(): Promise<void> {
  const cwd = process.cwd();
  const config = getConfig();
  const convention = await detectConvention(cwd);
  const branch = getCurrentBranch(cwd);
  const repoName = getRepoName(cwd);

  if (isProtectedBranch(branch, config.git.protectedBranches)) {
    warning(`You are on a protected branch: "${branch}"`);
    const proceed = await confirmPrompt('Are you sure you want to commit here?', false);
    if (!proceed) {
      info('Commit cancelled.');
      return;
    }
  }

  let staged = getStagedFiles(cwd);
  const unstaged = getUnstagedFiles(cwd);
  const untracked = getUntrackedFiles(cwd);

  if (staged.length > 0) {
    section(`Currently Staged (${staged.length} file(s))`);
    for (const f of staged) console.log(`  ${f.status.charAt(0).toUpperCase()}  ${f.path}`);
    blank();

    const stagingChoice = await selectPrompt('How do you want to proceed?', [
      `Continue with these ${staged.length} staged file(s)`,
      'Add more files to staging',
      'Unstage all and re-select',
      'Cancel',
    ]);

    if (stagingChoice === 'Cancel') {
      info('Commit cancelled.');
      return;
    }
    if (stagingChoice.startsWith('Unstage')) {
      unstageAll(cwd);
      staged = [];
    } else if (stagingChoice.startsWith('Add more')) {
      const available = [...unstaged, ...untracked];
      if (available.length > 0) {
        const toAdd = await smartFileSelectPrompt('Select additional files to stage', available);
        if (toAdd.length > 0) {
          stageFiles(toAdd, cwd);
          staged = getStagedFiles(cwd);
        }
      }
    }
  }

  if (staged.length === 0) {
    const available = [...unstaged, ...untracked];
    if (available.length === 0) {
      if (hasCommits(cwd)) {
        info('No hay ficheros staged.');
        blank();
        const noStagedChoice = await selectPrompt('¿Qué quieres hacer?', [
          'Seleccionar ficheros para nuevo commit',
          'Enmendar el último commit',
          'Cancelar',
        ]);
        if (noStagedChoice === 'Enmendar el último commit') {
          await amendFlow(cwd);
          return;
        }
        if (noStagedChoice === 'Cancelar') {
          info('Commit cancelado.');
          return;
        }
        info('No hay ficheros disponibles para stagear.');
      } else {
        info('No changes to commit.');
      }
      return;
    }
    const toStage = await smartFileSelectPrompt('Select files to stage', available);
    if (toStage.length === 0) {
      info('Nothing selected. Commit cancelled.');
      return;
    }
    stageFiles(toStage, cwd);
    staged = getStagedFiles(cwd);
  }

  if (staged.length === 0) {
    info('No files staged. Commit cancelled.');
    return;
  }

  const scanResult = scanFiles(
    staged.map((f) => ({ path: f.path })),
    config.security.blockedFiles
  );
  if (!scanResult.clean) {
    if (scanResult.blockedFiles.length > 0)
      error(`Sensitive files staged: ${scanResult.blockedFiles.join(', ')}`);
    if (scanResult.detectedSecrets.length > 0)
      warning(`Potential secrets detected: ${scanResult.summary}`);
    if (config.security.blockOnSecrets) {
      error('Commit blocked due to security issues.');
      return;
    }
  }

  const ticket = extractTicketFromBranch(branch, config.commit.ticketPattern);
  const aiContext = buildAIContext({
    repoName,
    branch,
    ticket,
    convention,
    stagedFiles: staged,
    allowRawDiff: config.ai.allowRawDiff,
  });

  const provider = await createProviderWithFallback(config);
  startSpinner(`Generating commit message with ${provider.name}...`);
  let message: string;
  try {
    message = await provider.generateCommitMessage(aiContext);
    succeedSpinner();
  } catch {
    failSpinner('Generation failed — falling back to guided builder');
    const built = await guidedMessageBuilder();
    if (!built) {
      info('Commit cancelled.');
      return;
    }
    message = built;
  }

  let done = false;
  while (!done) {
    section('Proposed Commit Message');
    console.log(`\n  ${message.split('\n').join('\n  ')}\n`);
    keyValue('Provider', provider.name);
    blank();

    const choice = await selectPrompt('What do you want to do?', [
      'Accept and commit',
      'Edit message (guided)',
      'Regenerate',
      'View AI context',
      'Cancel',
    ]);

    if (choice === 'Accept and commit') {
      const confirmed = await confirmPrompt(`Commit with message: "${message.split('\n')[0]}"?`);
      if (!confirmed) {
        info('Commit cancelled.');
        return;
      }
      try {
        execSync(`git commit -m ${JSON.stringify(message)}`, { cwd, stdio: 'inherit' });
        success('Commit created successfully.');
      } catch {
        error('git commit failed.');
      }
      done = true;
    } else if (choice === 'Edit message (guided)') {
      const edited = await guidedMessageBuilder(message);
      if (edited) message = edited;
    } else if (choice === 'Regenerate') {
      startSpinner('Regenerating...');
      try {
        message = await provider.generateCommitMessage(aiContext);
        succeedSpinner();
      } catch {
        failSpinner();
      }
    } else if (choice === 'View AI context') {
      section('AI Context');
      console.log(JSON.stringify(aiContext, null, 2));
    } else {
      info('Commit cancelled.');
      done = true;
    }
  }
}

// ── Entry point ────────────────────────────────────────────────────────────

export async function runCommit(): Promise<void> {
  const cwd = process.cwd();
  if (!(await ensureGitRepo(cwd))) return;

  if (isCI()) {
    await runPlainCommit();
  } else {
    await runInkCommit();
  }
}
