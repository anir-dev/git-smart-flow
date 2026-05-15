import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
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
import { blank, error, info, keyValue, section, success } from '../ux/display.js';
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

  // Choose base branch first (before Ink)
  const base = config.git.defaultBaseBranches[0] ?? 'main';

  const commits = getCommitsSinceBase(base, cwd);
  const staged = getStagedFiles(cwd);

  const templatePaths = [
    join(cwd, '.github/pull_request_template.md'),
    join(cwd, '.github/PULL_REQUEST_TEMPLATE.md'),
  ];
  const templateContent = templatePaths.reduce<string | null>((found, p) => {
    if (found) return found;
    return existsSync(p) ? readFileSync(p, 'utf-8') : null;
  }, null) ?? DEFAULT_TEMPLATE;

  const aiContext = buildAIContext({
    repoName, branch, ticket, convention, stagedFiles: staged,
    allowRawDiff: config.ai.allowRawDiff,
  });

  function PRFlow({ onDone }: { onDone: () => void }): JSX.Element {
    const { exit } = useApp();
    const [phase, setPhase] = useState<'generating' | 'result'>('generating');
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [active, setActive] = useState(false);
    useEffect(() => { const t = setTimeout(() => setActive(true), 120); return () => clearTimeout(t); }, []);

    const finish = (): void => { exit(); onDone(); };

    useEffect(() => {
      if (phase !== 'generating') return;
      let cancelled = false;

      (async () => {
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

      return () => { cancelled = true; };
    }, [phase]);

    const width = Math.min(process.stdout.columns ?? 80, 78);

    if (phase === 'generating') {
      return React.createElement(Box, { paddingX: 1, flexDirection: 'column' },
        React.createElement(Spinner, { label: `Analizando ${commits.length} commits desde ${base}...` })
      ) as JSX.Element;
    }

    const options = [
      { label: '📋 Copiar título al portapapeles', value: 'copy-title' },
      { label: '📋 Copiar descripción completa', value: 'copy-body' },
      { label: '💾 Guardar en PULL_REQUEST.md', value: 'save' },
      { label: '🔄 Regenerar', value: 'regenerate' },
      { label: '✖ Salir', value: 'exit' },
    ];

    return React.createElement(Box, { flexDirection: 'column', paddingX: 1, width },
      // Title box
      React.createElement(Box, {
        flexDirection: 'column', borderStyle: 'round' as const,
        borderColor: theme.accent, paddingX: 1, marginBottom: 1,
      },
        React.createElement(Text, { color: theme.muted }, 'Título del PR'),
        React.createElement(Text, { bold: true, color: 'white' }, title),
      ),

      // Body box
      React.createElement(Box, {
        flexDirection: 'column', borderStyle: 'round' as const,
        borderColor: theme.border, paddingX: 1, marginBottom: 1, width: width - 2,
      },
        React.createElement(Text, { color: theme.muted }, 'Descripción'),
        React.createElement(Text, null),
        ...body.split('\n').slice(0, 15).map((line, i) =>
          React.createElement(Text, { key: i, color: '#d1d5db' }, line)
        ),
        body.split('\n').length > 15
          ? React.createElement(Text, { color: theme.muted }, `  … (${body.split('\n').length - 15} líneas más)`)
          : null,
      ),

      React.createElement(Text, { color: theme.muted },
        `  ${commits.length} commits  ·  ${staged.length} archivos  ·  ${config.ai.provider}`
      ),
      React.createElement(Text, null),

      React.createElement(Select, {
        isDisabled: !active,
        options,
        onChange: async (val: string) => {
          if (val === 'exit') { finish(); return; }
          if (val === 'regenerate') { setPhase('generating'); return; }

          const fullContent = `# ${title}\n\n${body}`;
          try {
            if (val === 'copy-title' || val === 'copy-body') {
              const { default: clipboardy } = await import('clipboardy');
              await clipboardy.write(val === 'copy-title' ? title : fullContent);
              success('Copiado al portapapeles.');
            } else if (val === 'save') {
              writeFileSync(join(cwd, 'PULL_REQUEST.md'), fullContent, 'utf-8');
              success('Guardado en PULL_REQUEST.md');
            }
          } catch (e) {
            error('Operación fallida.');
          }
          finish();
        },
      })
    ) as JSX.Element;
  }

  await renderInteractive<void>((resolve) =>
    React.createElement(PRFlow, { onDone: resolve }) as JSX.Element
  );
}

async function runPlainPR(): Promise<void> {
  const cwd = process.cwd();
  const config = getConfig();
  const convention = await detectConvention(cwd);
  const branch = getCurrentBranch(cwd);
  const repoName = getRepoName(cwd);
  const ticket = extractTicketFromBranch(branch, config.commit.ticketPattern);

  let base = config.git.defaultBaseBranches[0] ?? 'main';
  const basePick = await selectPrompt(
    `Base branch for PR (current: ${base}):`,
    [...config.git.defaultBaseBranches, 'Enter manually']
  );
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
  const templateContent = templatePaths.reduce<string | null>((found, p) => {
    if (found) return found;
    return existsSync(p) ? readFileSync(p, 'utf-8') : null;
  }, null) ?? DEFAULT_TEMPLATE;

  const aiContext = buildAIContext({
    repoName, branch, ticket, convention, stagedFiles: staged,
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
    'Copy to clipboard', 'Save to pr-description.md', 'Print to terminal', 'Done',
  ]);

  const fullContent = `# ${proposal.title}\n\n${proposal.body}`;
  if (action === 'Copy to clipboard') {
    try {
      const { default: clipboardy } = await import('clipboardy');
      await clipboardy.write(fullContent);
      success('Copied to clipboard.');
    } catch { error('Failed to copy to clipboard.'); }
  } else if (action === 'Save to pr-description.md') {
    writeFileSync(join(cwd, 'pr-description.md'), fullContent, 'utf-8');
    success('Saved to pr-description.md');
  } else if (action === 'Print to terminal') {
    console.log('\n' + fullContent);
  }
}

export async function runPR(): Promise<void> {
  const cwd = process.cwd();
  if (!await ensureGitRepo(cwd)) return;

  if (isCI()) {
    await runPlainPR();
  } else {
    await runInkPR();
  }
}
