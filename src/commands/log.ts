import { spawnSync } from 'child_process';
import { ensureGitRepo } from '../git/ensure-repo.js';
import { isCI } from '../ux/renderer.js';

async function runInkLog(cwd: string): Promise<void> {
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
    return React.createElement(Box, { flexDirection: 'column', paddingX: 1, width },
      React.createElement(Box, { marginBottom: 1 },
        React.createElement(Text, { bold: true, color: 'white' }, repoName),
        React.createElement(Text, { color: theme.muted }, '  ·  '),
        React.createElement(Text, { color: theme.info }, branch),
        React.createElement(Text, { color: theme.muted }, '  ·  commit history'),
      ),
      React.createElement(BranchTree, { cwd, limit: 25, showMeta: true }),
    ) as JSX.Element;
  }

  const { unmount } = render(React.createElement(LogView, null) as JSX.Element);
  // Allow useEffect (synchronous spawnSync inside) and state re-render to complete
  await new Promise<void>((r) => setTimeout(() => { unmount(); r(); }, 80));
  console.log('');
}

function runPlainLog(cwd: string): void {
  spawnSync('git', ['log', '--graph', '--oneline', '--all', '-25'], { cwd, stdio: 'inherit' });
}

export async function runLog(): Promise<void> {
  const cwd = process.cwd();
  if (!await ensureGitRepo(cwd)) return;

  if (isCI()) {
    runPlainLog(cwd);
  } else {
    await runInkLog(cwd);
  }
}
