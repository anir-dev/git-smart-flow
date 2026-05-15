import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getConfig } from '../config/config.js';
import { detectConvention } from '../git/convention-detector.js';
import { ensureGitRepo } from '../git/ensure-repo.js';
import {
  buildRepoContext,
  getCurrentBranch,
  getLastCommit,
  getLastFetchTime,
  getRepoName,
  getUpstream,
} from '../git/repo.js';
import { isCI } from '../ux/renderer.js';
import { blank, divider, keyValue, section } from '../ux/display.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runInkInfo(cwd: string): Promise<void> {
  const React = (await import('react')).default;
  const { Box, Text } = await import('ink');
  const { render } = await import('ink');
  const { theme } = await import('../ux/theme.js');
  const { StatusDashboard } = await import('../ux/components/StatusDashboard.js');

  const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8')) as { version: string };
  const config = getConfig();
  const convention = await detectConvention(cwd);

  const ctx = await buildRepoContext(
    config.git.protectedBranches,
    config.commit.ticketPattern,
    convention,
    cwd
  );
  const lastCommit = getLastCommit(cwd);
  const lastFetch = getLastFetchTime(cwd);

  function InfoView(): JSX.Element {
    const width = Math.min(process.stdout.columns ?? 80, 78);
    return React.createElement(Box, { flexDirection: 'column', paddingX: 1, width },
      React.createElement(StatusDashboard, {
        ctx,
        lastCommit,
        lastFetch,
        version: pkg.version,
        provider: config.ai.provider,
        cwd,
        graphLimit: 8,
      }),
      ctx.stagedFiles.length > 0
        ? React.createElement(Box, { flexDirection: 'column', marginTop: 0 },
            React.createElement(Text, { bold: true, color: '#d1d5db' }, 'Staged files'),
            React.createElement(Text, { color: theme.muted }, '─'.repeat(40)),
            React.createElement(Box, { flexDirection: 'column' },
              ...ctx.stagedFiles.map((f, i) =>
                React.createElement(Text, { key: i, color: 'white' }, `  ${f.status.charAt(0).toUpperCase()}  ${f.path}`)
              )
            ),
          )
        : null,
    ) as JSX.Element;
  }

  const { unmount } = render(React.createElement(InfoView, null) as JSX.Element);
  // Allow BranchTree useEffect (sync spawnSync) and state re-render to complete
  await new Promise<void>((r) => setTimeout(() => { unmount(); r(); }, 80));
  console.log('');
}

async function runPlainInfo(cwd: string): Promise<void> {
  const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8')) as { version: string };
  const config = getConfig();
  const convention = await detectConvention(cwd);
  const branch = getCurrentBranch(cwd);
  const repoName = getRepoName(cwd);
  const upstream = getUpstream(cwd);

  const ctx = await buildRepoContext(
    config.git.protectedBranches,
    config.commit.ticketPattern,
    convention,
    cwd
  );

  section('Repository Context');
  keyValue('Repository', repoName);
  keyValue('Branch', branch);
  keyValue('Convention', `${convention.type}${convention.hasCommitlint ? ' (commitlint detected)' : ''}`);
  keyValue('Commitlint', convention.hasCommitlint ? 'detected' : 'not detected');
  keyValue('Husky', convention.hasHusky ? 'detected' : 'not detected');
  keyValue('AI Provider', config.ai.provider);
  keyValue('Upstream', upstream ?? 'none');
  blank();

  section('Staged Files');
  if (ctx.stagedFiles.length === 0) {
    keyValue('Status', 'none');
  } else {
    for (const f of ctx.stagedFiles) keyValue(f.status, f.path, 2);
  }
  blank();

  if (ctx.unstagedFiles.length > 0) {
    section('Unstaged Files');
    for (const f of ctx.unstagedFiles) keyValue('modified', f, 2);
    blank();
  }

  if (ctx.untrackedFiles.length > 0) {
    section('Untracked Files');
    for (const f of ctx.untrackedFiles) keyValue('untracked', f, 2);
    blank();
  }

  if (convention.allowedTypes.length > 0) {
    section('Allowed Commit Types');
    console.log('  ' + convention.allowedTypes.join(', '));
    blank();
  }

  divider();
  keyValue('git-smart-flow', `v${pkg.version}`);
}

export async function runInfo(): Promise<void> {
  const cwd = process.cwd();
  if (!await ensureGitRepo(cwd)) return;

  if (isCI()) {
    await runPlainInfo(cwd);
  } else {
    await runInkInfo(cwd);
  }
}
