import type { JSX } from 'react';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { getConfig } from '../config/config.js';
import { buildAIContext } from '../git/ai-context-builder.js';
import { detectConvention } from '../git/convention-detector.js';
import { ensureGitRepo } from '../git/ensure-repo.js';
import {
  extractTicketFromBranch,
  getCurrentBranch,
  getCommitsSinceBase,
  getRepoName,
  getStagedFiles,
} from '../git/repo.js';
import { createProviderWithFallback } from '../providers/provider.factory.js';
import { isCI } from '../ux/renderer.js';
import { blank, divider, error, info, keyValue, section, success } from '../ux/display.js';
import { confirmPrompt, inputPrompt, selectPrompt } from '../ux/prompt.js';
import { failSpinner, startSpinner, succeedSpinner } from '../ux/spinner.js';

const DEFAULT_TEMPLATE = `## Context
<!-- Why is this change needed? -->

## Changes
<!-- What has been changed? -->

## Testing
<!-- How has this been tested? -->

## Risks / Impact
<!-- Any risks or impacts? -->

## Additional Notes
<!-- Any other relevant information? -->
`;

// ── gh CLI helpers ──────────────────────────────────────────────────────────

function ghAvailable(): boolean {
  return spawnSync('gh', ['auth', 'status'], { encoding: 'utf-8', stdio: 'pipe' }).status === 0;
}

function requireGh(): boolean {
  if (ghAvailable()) return true;
  error('Esta funcionalidad requiere GitHub CLI (gh) autenticado.');
  info('  Instala gh: https://cli.github.com');
  info('  Luego ejecuta: gh auth login');
  return false;
}

// ── New GitHub-integrated operations ───────────────────────────────────────

async function runCreatePROnGitHub(title: string, body: string): Promise<void> {
  if (!requireGh()) return;

  const config = getConfig();
  const cwd = process.cwd();
  const defaultBase = config.git.defaultBaseBranches[0] ?? 'main';

  const basePick = await selectPrompt(`Rama base (actual: ${defaultBase}):`, [
    ...config.git.defaultBaseBranches,
    'Ingresar manualmente',
  ]);
  let base: string;
  if (basePick === 'Ingresar manualmente') {
    base = await inputPrompt('Rama base', defaultBase);
  } else {
    base = basePick;
  }

  const draft = await confirmPrompt('¿Crear como draft?', false);

  const reviewersInput = await inputPrompt('Reviewers (opcional, separados por coma)', '');
  const reviewers = reviewersInput
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);

  blank();
  section('Vista previa del PR');
  keyValue('Título', title);
  keyValue('Base', base);
  keyValue('Draft', draft ? 'Sí' : 'No');
  if (reviewers.length > 0) keyValue('Reviewers', reviewers.join(', '));
  blank();
  console.log(body.split('\n').slice(0, 10).join('\n'));
  if (body.split('\n').length > 10) {
    info(`  … (${body.split('\n').length - 10} líneas más)`);
  }
  blank();

  const confirmed = await confirmPrompt('¿Crear el PR?', true);
  if (!confirmed) {
    info('Operación cancelada.');
    return;
  }

  const args = ['pr', 'create', '--title', title, '--body', body, '--base', base];
  if (draft) args.push('--draft');
  for (const reviewer of reviewers) {
    args.push('--reviewer', reviewer);
  }

  startSpinner('Creando PR en GitHub...');
  const result = spawnSync('gh', args, { encoding: 'utf-8', stdio: 'pipe', cwd });
  if (result.status !== 0) {
    failSpinner('Error al crear PR');
    error(result.stderr?.trim() || 'Error desconocido');
    return;
  }
  succeedSpinner('PR creado');

  const url = result.stdout?.trim() ?? '';
  if (url) {
    success(`URL: ${url}`);
    const open = await confirmPrompt('¿Abrir en el navegador?', true);
    if (open) {
      spawnSync('gh', ['pr', 'view', '--web'], { cwd, stdio: 'inherit' });
    }
  }
}

function runPRStatus(): void {
  if (!requireGh()) return;

  const cwd = process.cwd();
  startSpinner('Obteniendo estado de PRs...');
  const result = spawnSync(
    'gh',
    ['pr', 'status', '--json', 'number,title,headRefName,statusCheckRollup,reviewDecision,url'],
    { encoding: 'utf-8', stdio: 'pipe', cwd }
  );
  if (result.status !== 0) {
    failSpinner('Error al obtener estado');
    error(result.stderr?.trim() || 'Error desconocido');
    return;
  }
  succeedSpinner();

  let data: {
    currentBranch?: {
      number: number;
      title: string;
      headRefName: string;
      url: string;
      statusCheckRollup?: Array<{ state: string }>;
      reviewDecision?: string;
    };
    createdBy?: Array<{
      number: number;
      title: string;
      headRefName: string;
      url: string;
      statusCheckRollup?: Array<{ state: string }>;
      reviewDecision?: string;
    }>;
    needsReview?: Array<{
      number: number;
      title: string;
      headRefName: string;
      url: string;
    }>;
  } = {};

  try {
    data = JSON.parse(result.stdout) as typeof data;
  } catch {
    error('No se pudo parsear la respuesta de gh.');
    return;
  }

  function checksLabel(checks?: Array<{ state: string }>): string {
    if (!checks || checks.length === 0) return '';
    const pass = checks.filter((c) => c.state === 'SUCCESS').length;
    const fail = checks.filter((c) => c.state === 'FAILURE').length;
    const pending = checks.filter((c) => c.state === 'PENDING' || c.state === 'IN_PROGRESS').length;
    if (fail > 0) return `❌ ${fail} check(s) fallaron`;
    if (pending > 0) return `⏳ ${pending} en progreso`;
    return `✅ ${pass}/${checks.length} checks`;
  }

  function reviewLabel(decision?: string): string {
    if (!decision) return '';
    if (decision === 'APPROVED') return '✅ Aprobado';
    if (decision === 'CHANGES_REQUESTED') return '🔄 Cambios solicitados';
    if (decision === 'REVIEW_REQUIRED') return '🔍 Review requerido';
    return decision;
  }

  blank();
  section('Estado de Pull Requests');
  divider();

  blank();
  info('Rama actual');
  if (data.currentBranch) {
    const pr = data.currentBranch;
    const checks = checksLabel(pr.statusCheckRollup);
    const review = reviewLabel(pr.reviewDecision);
    const meta = [checks, review].filter(Boolean).join('  ·  ');
    console.log(`  #${pr.number}  ${pr.title}  [${pr.headRefName}]`);
    if (meta) console.log(`  ${meta}`);
    keyValue('URL', pr.url, 2);
  } else {
    info('  No hay PR asociado a la rama actual.');
  }

  blank();
  info('Creados por ti');
  if (data.createdBy && data.createdBy.length > 0) {
    for (const pr of data.createdBy) {
      const checks = checksLabel(pr.statusCheckRollup);
      const review = reviewLabel(pr.reviewDecision);
      const meta = [checks, review].filter(Boolean).join('  ·  ');
      console.log(`  #${pr.number}  ${pr.title}  [${pr.headRefName}]`);
      if (meta) console.log(`  ${meta}`);
    }
  } else {
    info('  Sin PRs abiertos.');
  }

  blank();
  info('Esperando tu review');
  if (data.needsReview && data.needsReview.length > 0) {
    for (const pr of data.needsReview) {
      console.log(`  #${pr.number}  ${pr.title}  [${pr.headRefName}]`);
    }
  } else {
    info('  Ninguno.');
  }

  blank();
  divider();
}

async function runPRChecks(): Promise<void> {
  if (!requireGh()) return;

  const cwd = process.cwd();

  const display = (): void => {
    startSpinner('Obteniendo CI checks...');
    const result = spawnSync(
      'gh',
      ['pr', 'checks', '--json', 'name,state,completedAt,startedAt,link'],
      { encoding: 'utf-8', stdio: 'pipe', cwd }
    );
    if (result.status !== 0) {
      failSpinner('Error al obtener checks');
      error(result.stderr?.trim() || 'Error desconocido');
      return;
    }
    succeedSpinner();

    let checks: Array<{
      name: string;
      state: string;
      completedAt?: string;
      startedAt?: string;
      link?: string;
    }> = [];

    try {
      checks = JSON.parse(result.stdout) as typeof checks;
    } catch {
      error('No se pudo parsear la respuesta de gh.');
      return;
    }

    blank();
    section('CI Checks');
    divider();
    for (const check of checks) {
      const state = check.state?.toUpperCase() ?? '';
      let icon: string;
      if (state === 'SUCCESS' || state === 'PASS') icon = '✅';
      else if (state === 'FAILURE' || state === 'FAIL' || state === 'ERROR') icon = '❌';
      else if (state === 'PENDING' || state === 'IN_PROGRESS' || state === 'QUEUED') icon = '⏳';
      else if (state === 'SKIPPED' || state === 'NEUTRAL') icon = '○';
      else icon = '○';
      console.log(`  ${icon}  ${check.name}  ${check.link ? `[${check.link}]` : ''}`);
    }
    divider();
    blank();
  };

  display();

  while (true) {
    const again = await confirmPrompt('¿Actualizar checks?', false);
    if (!again) break;
    display();
  }
}

async function runPRMerge(): Promise<void> {
  if (!requireGh()) return;

  const cwd = process.cwd();
  startSpinner('Obteniendo información del PR...');
  const viewResult = spawnSync(
    'gh',
    ['pr', 'view', '--json', 'number,title,state,statusCheckRollup,reviewDecision'],
    { encoding: 'utf-8', stdio: 'pipe', cwd }
  );
  if (viewResult.status !== 0) {
    failSpinner('Error al obtener PR');
    error(viewResult.stderr?.trim() || 'No hay PR asociado a la rama actual.');
    return;
  }
  succeedSpinner();

  let pr: {
    number: number;
    title: string;
    state: string;
    statusCheckRollup?: Array<{ state: string }>;
    reviewDecision?: string;
  };

  try {
    pr = JSON.parse(viewResult.stdout) as typeof pr;
  } catch {
    error('No se pudo parsear la respuesta de gh.');
    return;
  }

  blank();
  section(`PR #${pr.number}: ${pr.title}`);
  keyValue('Estado', pr.state);
  if (pr.reviewDecision) keyValue('Review', pr.reviewDecision);
  blank();

  const strategy = await selectPrompt('Estrategia de merge:', [
    'Merge commit',
    'Squash and merge (recomendado para features)',
    'Rebase and merge',
  ]);

  const deleteBranch = await confirmPrompt('¿Eliminar rama tras el merge?', true);
  const confirmed = await confirmPrompt(`¿Confirmar merge del PR #${pr.number}?`, true);
  if (!confirmed) {
    info('Operación cancelada.');
    return;
  }

  const mergeFlag =
    strategy === 'Squash and merge (recomendado para features)'
      ? '--squash'
      : strategy === 'Rebase and merge'
        ? '--rebase'
        : '--merge';

  const args = ['pr', 'merge', String(pr.number), mergeFlag];
  if (deleteBranch) args.push('--delete-branch');

  startSpinner('Mergeando PR...');
  const mergeResult = spawnSync('gh', args, { encoding: 'utf-8', stdio: 'pipe', cwd });
  if (mergeResult.status !== 0) {
    failSpinner('Error al mergear');
    error(mergeResult.stderr?.trim() || 'Error desconocido');
    return;
  }
  succeedSpinner(`PR #${pr.number} mergeado correctamente`);
  if (mergeResult.stdout?.trim()) console.log(mergeResult.stdout.trim());
}

async function runPRCheckout(): Promise<void> {
  if (!requireGh()) return;

  const cwd = process.cwd();
  startSpinner('Obteniendo lista de PRs...');
  const result = spawnSync(
    'gh',
    ['pr', 'list', '--json', 'number,title,headRefName,author,url', '--limit', '10'],
    { encoding: 'utf-8', stdio: 'pipe', cwd }
  );
  if (result.status !== 0) {
    failSpinner('Error al obtener PRs');
    error(result.stderr?.trim() || 'Error desconocido');
    return;
  }
  succeedSpinner();

  let prs: Array<{
    number: number;
    title: string;
    headRefName: string;
    author: { login: string };
    url: string;
  }> = [];

  try {
    prs = JSON.parse(result.stdout) as typeof prs;
  } catch {
    error('No se pudo parsear la respuesta de gh.');
    return;
  }

  if (prs.length === 0) {
    info('No hay PRs abiertos.');
    return;
  }

  const choices = prs.map(
    (pr) => `#${pr.number}  ${pr.title}  (by @${pr.author?.login ?? 'unknown'})`
  );
  const picked = await selectPrompt('Selecciona un PR para checkout:', choices);
  const idx = choices.indexOf(picked);
  const pr = prs[idx];
  if (!pr) return;

  startSpinner(`Haciendo checkout del PR #${pr.number}...`);
  const checkoutResult = spawnSync('gh', ['pr', 'checkout', String(pr.number)], {
    encoding: 'utf-8',
    stdio: 'pipe',
    cwd,
  });
  if (checkoutResult.status !== 0) {
    failSpinner('Error en checkout');
    error(checkoutResult.stderr?.trim() || 'Error desconocido');
    return;
  }
  succeedSpinner(`Checkout en rama: ${pr.headRefName}`);

  blank();
  section(`PR #${pr.number}: ${pr.title}`);
  keyValue('Rama', pr.headRefName);
  keyValue('Autor', `@${pr.author?.login ?? 'unknown'}`);
  keyValue('URL', pr.url);
}

async function runPRReview(): Promise<void> {
  if (!requireGh()) return;

  const cwd = process.cwd();
  startSpinner('Buscando PRs que requieren tu review...');
  const result = spawnSync(
    'gh',
    [
      'pr',
      'list',
      '--search',
      'review-requested:@me',
      '--json',
      'number,title,author,url',
      '--limit',
      '10',
    ],
    { encoding: 'utf-8', stdio: 'pipe', cwd }
  );
  if (result.status !== 0) {
    failSpinner('Error al obtener PRs');
    error(result.stderr?.trim() || 'Error desconocido');
    return;
  }
  succeedSpinner();

  let prs: Array<{
    number: number;
    title: string;
    author: { login: string };
    url: string;
  }> = [];

  try {
    prs = JSON.parse(result.stdout) as typeof prs;
  } catch {
    error('No se pudo parsear la respuesta de gh.');
    return;
  }

  if (prs.length === 0) {
    info('No hay PRs esperando tu review.');
    return;
  }

  const choices = prs.map(
    (pr) => `#${pr.number}  ${pr.title}  (by @${pr.author?.login ?? 'unknown'})`
  );
  const picked = await selectPrompt('Selecciona un PR para revisar:', choices);
  const idx = choices.indexOf(picked);
  const pr = prs[idx];
  if (!pr) return;

  blank();
  section(`Diff del PR #${pr.number}`);
  divider();
  const diffResult = spawnSync('gh', ['pr', 'diff', String(pr.number)], {
    encoding: 'utf-8',
    stdio: 'pipe',
    cwd,
  });
  if (diffResult.status === 0 && diffResult.stdout) {
    const lines = diffResult.stdout.split('\n');
    const preview = lines.slice(0, 50);
    console.log(preview.join('\n'));
    if (lines.length > 50) {
      info(`  … (${lines.length - 50} líneas más)`);
    }
  } else {
    info('No se pudo obtener el diff.');
  }
  divider();
  blank();

  const action = await selectPrompt('Acción:', [
    '✅ Aprobar',
    '💬 Comentar',
    '🔄 Solicitar cambios',
    '← Volver',
  ]);

  if (action === '← Volver') return;

  let commentBody = '';
  if (action !== '✅ Aprobar') {
    commentBody = await inputPrompt('Comentario (opcional)', '');
  }

  let reviewFlag: string;
  if (action === '✅ Aprobar') reviewFlag = '--approve';
  else if (action === '💬 Comentar') reviewFlag = '--comment';
  else reviewFlag = '--request-changes';

  const reviewArgs = ['pr', 'review', String(pr.number), reviewFlag];
  if (commentBody) {
    reviewArgs.push('-b', commentBody);
  }

  startSpinner('Enviando review...');
  const reviewResult = spawnSync('gh', reviewArgs, { encoding: 'utf-8', stdio: 'pipe', cwd });
  if (reviewResult.status !== 0) {
    failSpinner('Error al enviar review');
    error(reviewResult.stderr?.trim() || 'Error desconocido');
    return;
  }
  succeedSpinner('Review enviado correctamente');
}

// ── Ink (interactive TTY) PR description flow ───────────────────────────────

async function runInkPR(): Promise<void> {
  const React = (await import('react')).default;
  const { Box, Text } = await import('ink');
  const { Select, Spinner } = await import('@inkjs/ui');
  const { renderInteractive } = await import('../ux/renderer.js');
  const { theme } = await import('../ux/theme.js');
  const { useState, useEffect } = await import('react');
  const { useApp } = await import('ink');

  const cwd = process.cwd();
  const config = getConfig();
  const convention = await detectConvention(cwd);
  const branch = getCurrentBranch(cwd);
  const repoName = getRepoName(cwd);
  const ticket = extractTicketFromBranch(branch, config.commit.ticketPattern);

  const base = config.git.defaultBaseBranches[0] ?? 'main';

  const commits = getCommitsSinceBase(base, cwd);
  const staged = getStagedFiles(cwd);

  const templatePaths = [
    join(cwd, '.github/pull_request_template.md'),
    join(cwd, '.github/PULL_REQUEST_TEMPLATE.md'),
  ];
  const templateContent =
    templatePaths.reduce<string | null>((found, p) => {
      if (found) return found;
      return existsSync(p) ? readFileSync(p, 'utf-8') : null;
    }, null) ?? DEFAULT_TEMPLATE;

  const aiContext = buildAIContext({
    repoName,
    branch,
    ticket,
    convention,
    stagedFiles: staged,
    allowRawDiff: config.ai.allowRawDiff,
  });

  const postAction: { title: string; body: string; create: boolean } = {
    title: '',
    body: '',
    create: false,
  };

  function PRFlow({ onDone }: { onDone: () => void }): JSX.Element {
    const { exit } = useApp();
    const [phase, setPhase] = useState<'generating' | 'result'>('generating');
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [active, setActive] = useState(false);
    useEffect(() => {
      const t = setTimeout(() => setActive(true), 120);
      return () => clearTimeout(t);
    }, []);

    const finish = (): void => {
      exit();
      onDone();
    };

    useEffect(() => {
      if (phase !== 'generating') return;
      let cancelled = false;

      void (async () => {
        try {
          const provider = await createProviderWithFallback(config);
          const proposal = await provider.generatePRDescription(aiContext);
          if (!cancelled) {
            setTitle(proposal.title);
            setBody(proposal.body);
            setPhase('result');
          }
        } catch {
          if (!cancelled) {
            setTitle(branch);
            setBody(templateContent);
            setPhase('result');
          }
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [phase]);

    const width = Math.min(process.stdout.columns ?? 80, 78);

    if (phase === 'generating') {
      return React.createElement(
        Box,
        { paddingX: 1, flexDirection: 'column' },
        React.createElement(Spinner, {
          label: `Analizando ${commits.length} commits desde ${base}...`,
        })
      );
    }

    const options = [
      { label: '📋 Copiar título al portapapeles', value: 'copy-title' },
      { label: '📋 Copiar descripción completa', value: 'copy-body' },
      { label: '💾 Guardar en PULL_REQUEST.md', value: 'save' },
      { label: '🚀 Crear PR en GitHub', value: 'create-gh' },
      { label: '🔄 Regenerar', value: 'regenerate' },
      { label: '✖ Salir', value: 'exit' },
    ];

    return React.createElement(
      Box,
      { flexDirection: 'column', paddingX: 1, width },
      React.createElement(
        Box,
        {
          flexDirection: 'column',
          borderStyle: 'round' as const,
          borderColor: theme.accent,
          paddingX: 1,
          marginBottom: 1,
        },
        React.createElement(Text, { color: theme.muted }, 'Título del PR'),
        React.createElement(Text, { bold: true, color: 'white' }, title)
      ),

      React.createElement(
        Box,
        {
          flexDirection: 'column',
          borderStyle: 'round' as const,
          borderColor: theme.border,
          paddingX: 1,
          marginBottom: 1,
          width: width - 2,
        },
        React.createElement(Text, { color: theme.muted }, 'Descripción'),
        React.createElement(Text, null),
        ...body
          .split('\n')
          .slice(0, 15)
          .map((line, i) => React.createElement(Text, { key: i, color: '#d1d5db' }, line)),
        body.split('\n').length > 15
          ? React.createElement(
              Text,
              { color: theme.muted },
              `  … (${body.split('\n').length - 15} líneas más)`
            )
          : null
      ),

      React.createElement(
        Text,
        { color: theme.muted },
        `  ${commits.length} commits  ·  ${staged.length} archivos  ·  ${config.ai.provider}`
      ),
      React.createElement(Text, null),

      React.createElement(Select, {
        isDisabled: !active,
        options,
        onChange: (val: string) => {
          if (val === 'exit') {
            finish();
            return;
          }
          if (val === 'regenerate') {
            setPhase('generating');
            return;
          }
          if (val === 'create-gh') {
            postAction.title = title;
            postAction.body = body;
            postAction.create = true;
            finish();
            return;
          }

          const fullContent = `# ${title}\n\n${body}`;
          void (async () => {
            try {
              if (val === 'copy-title' || val === 'copy-body') {
                const { default: clipboardy } = await import('clipboardy');
                await clipboardy.write(val === 'copy-title' ? title : fullContent);
                success('Copiado al portapapeles.');
              } else if (val === 'save') {
                writeFileSync(join(cwd, 'PULL_REQUEST.md'), fullContent, 'utf-8');
                success('Guardado en PULL_REQUEST.md');
              }
            } catch {
              error('Operación fallida.');
            }
            finish();
          })();
        },
      })
    );
  }

  await renderInteractive<void>(
    (resolve) => React.createElement(PRFlow, { onDone: resolve }) as JSX.Element
  );

  if (postAction.create) {
    await runCreatePROnGitHub(postAction.title, postAction.body);
  }
}

// ── Plain (CI / non-TTY) PR description flow ────────────────────────────────

async function runPlainPR(): Promise<void> {
  const cwd = process.cwd();
  const config = getConfig();
  const convention = await detectConvention(cwd);
  const branch = getCurrentBranch(cwd);
  const repoName = getRepoName(cwd);
  const ticket = extractTicketFromBranch(branch, config.commit.ticketPattern);

  let base = config.git.defaultBaseBranches[0] ?? 'main';
  const basePick = await selectPrompt(`Base branch for PR (current: ${base}):`, [
    ...config.git.defaultBaseBranches,
    'Enter manually',
  ]);
  if (basePick === 'Enter manually') {
    base = await inputPrompt('Base branch');
  } else {
    base = basePick;
  }

  const commits = getCommitsSinceBase(base, cwd);
  const staged = getStagedFiles(cwd);

  const templatePaths = [
    join(cwd, '.github/pull_request_template.md'),
    join(cwd, '.github/PULL_REQUEST_TEMPLATE.md'),
    join(cwd, '.gitlab/merge_request_templates/Default.md'),
  ];
  const templateContent =
    templatePaths.reduce<string | null>((found, p) => {
      if (found) return found;
      return existsSync(p) ? readFileSync(p, 'utf-8') : null;
    }, null) ?? DEFAULT_TEMPLATE;

  const aiContext = buildAIContext({
    repoName,
    branch,
    ticket,
    convention,
    stagedFiles: staged,
    allowRawDiff: config.ai.allowRawDiff,
  });

  const provider = await createProviderWithFallback(config);
  startSpinner(`Generating PR description with ${provider.name}...`);

  let proposal;
  try {
    proposal = await provider.generatePRDescription(aiContext);
    succeedSpinner();
  } catch {
    failSpinner();
    proposal = { title: branch, body: templateContent };
  }

  section('PR Title');
  console.log(`\n  ${proposal.title}\n`);
  section('PR Body');
  console.log('\n' + proposal.body);
  blank();
  keyValue('Commits since base', String(commits.length));
  keyValue('Provider', provider.name);
  blank();

  const action = await selectPrompt('What do you want to do?', [
    'Copy to clipboard',
    'Save to pr-description.md',
    'Print to terminal',
    'Create PR on GitHub',
    'Done',
  ]);

  const fullContent = `# ${proposal.title}\n\n${proposal.body}`;
  if (action === 'Copy to clipboard') {
    try {
      const { default: clipboardy } = await import('clipboardy');
      await clipboardy.write(fullContent);
      success('Copied to clipboard.');
    } catch {
      error('Failed to copy to clipboard.');
    }
  } else if (action === 'Save to pr-description.md') {
    writeFileSync(join(cwd, 'pr-description.md'), fullContent, 'utf-8');
    success('Saved to pr-description.md');
  } else if (action === 'Print to terminal') {
    console.log('\n' + fullContent);
  } else if (action === 'Create PR on GitHub') {
    await runCreatePROnGitHub(proposal.title, proposal.body);
  }
}

// ── Main entry point ─────────────────────────────────────────────────────────

export async function runPR(): Promise<void> {
  const cwd = process.cwd();
  if (!(await ensureGitRepo(cwd))) return;

  if (isCI()) {
    await runPlainPR();
    return;
  }

  const choice = await selectPrompt('gsf pr — ¿Qué quieres hacer?', [
    'Generar descripción del PR (IA)',
    'Crear PR en GitHub',
    'Ver estado de PRs',
    'Monitorizar CI checks',
    'Mergear PR en GitHub',
    'Checkout de PR',
    'Review de PR',
    'Salir',
  ]);

  switch (choice) {
    case 'Generar descripción del PR (IA)':
      await runInkPR();
      break;
    case 'Crear PR en GitHub':
      await runCreatePROnGitHub('', '');
      break;
    case 'Ver estado de PRs':
      runPRStatus();
      break;
    case 'Monitorizar CI checks':
      await runPRChecks();
      break;
    case 'Mergear PR en GitHub':
      await runPRMerge();
      break;
    case 'Checkout de PR':
      await runPRCheckout();
      break;
    case 'Review de PR':
      await runPRReview();
      break;
    case 'Salir':
    default:
      break;
  }
}
