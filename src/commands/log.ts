import { spawnSync } from 'child_process';
import { ensureGitRepo } from '../git/ensure-repo.js';
import { getConfig } from '../config/config.js';
import { section, info, blank } from '../ux/display.js';
import { selectPrompt, inputPrompt } from '../ux/prompt.js';
import { isCI } from '../ux/renderer.js';

async function runInkLog(cwd: string, logLimit: number): Promise<void> {
  const React = (await import('react')).default;
  const { Box, Text } = await import('ink');
  const { render } = await import('ink');
  const { BranchTree } = await import('../ux/components/BranchTree.js');
  const { getCurrentBranch, getRepoName } = await import('../git/repo.js');
  const { theme } = await import('../ux/theme.js');

  const branch = getCurrentBranch(cwd);
  const repoName = getRepoName(cwd);

  function LogView(): JSX.Element {
    const width = Math.min(process.stdout.columns ?? 80, 78);
    return React.createElement(
      Box,
      { flexDirection: 'column', paddingX: 1, width },
      React.createElement(
        Box,
        { marginBottom: 1 },
        React.createElement(Text, { bold: true, color: 'white' }, repoName),
        React.createElement(Text, { color: theme.muted }, '  ·  '),
        React.createElement(Text, { color: theme.info }, branch),
        React.createElement(Text, { color: theme.muted }, '  ·  commit history')
      ),
      React.createElement(BranchTree, { cwd, limit: logLimit, showMeta: true })
    );
  }

  const { unmount } = render(React.createElement(LogView, null) as JSX.Element);
  await new Promise<void>((r) =>
    setTimeout(() => {
      unmount();
      r();
    }, 80)
  );
  console.log('');
}

function runPlainLog(cwd: string, logLimit: number): void {
  spawnSync('git', ['log', '--graph', '--oneline', '--all', `-${logLimit}`], {
    cwd,
    stdio: 'inherit',
  });
}

async function runFilteredLog(cwd: string): Promise<void> {
  section('Filtrar historial de commits');
  blank();

  const author = await inputPrompt('Autor (Enter para omitir)');
  const since = await inputPrompt(
    'Desde fecha (ej: "2024-01-01", "1 week ago", Enter para omitir)'
  );
  const until = await inputPrompt('Hasta fecha (ej: "2024-12-31", Enter para omitir)');
  const path = await inputPrompt('Fichero/directorio (Enter para omitir)');
  const grep = await inputPrompt('Buscar en mensaje (Enter para omitir)');

  const args: string[] = ['log', '--oneline', '--graph', '-50'];
  if (author.trim()) args.push(`--author=${author.trim()}`);
  if (since.trim()) args.push(`--since=${since.trim()}`);
  if (until.trim()) args.push(`--until=${until.trim()}`);
  if (grep.trim()) args.push(`--grep=${grep.trim()}`);
  if (path.trim()) args.push('--', path.trim());

  blank();
  section('Resultados');

  const result = spawnSync('git', args, { cwd, encoding: 'utf-8', stdio: 'pipe' });
  if (!result.stdout?.trim()) {
    info('No se encontraron commits con los filtros aplicados.');
    return;
  }

  const filters: string[] = [];
  if (author.trim()) filters.push(`autor: ${author}`);
  if (since.trim()) filters.push(`desde: ${since}`);
  if (until.trim()) filters.push(`hasta: ${until}`);
  if (path.trim()) filters.push(`path: ${path}`);
  if (grep.trim()) filters.push(`mensaje: ${grep}`);
  if (filters.length > 0) {
    info('Filtros: ' + filters.join(' · '));
    blank();
  }

  const lines = result.stdout.split('\n').filter(Boolean);
  lines.forEach((line) => console.log(line));
  blank();
  info(`${lines.length} resultado(s)`);
}

export async function runLog(): Promise<void> {
  const cwd = process.cwd();
  if (!(await ensureGitRepo(cwd))) return;

  const config = getConfig();
  const logLimit = config.ui?.logLimit ?? 25;

  if (isCI()) {
    runPlainLog(cwd, logLimit);
    return;
  }

  const choice = await selectPrompt('¿Qué quieres ver?', [
    'Ver historial completo',
    'Filtrar historial',
    'Salir',
  ]);

  if (choice === 'Ver historial completo') {
    await runInkLog(cwd, logLimit);
  } else if (choice === 'Filtrar historial') {
    await runFilteredLog(cwd);
  }
}
