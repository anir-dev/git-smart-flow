import { Box, Text } from 'ink';
import { branchColor, theme } from '../theme.js';
import type { RepoContext } from '../../types/index.js';
import type { LastCommit } from '../../git/repo.js';
import { BranchTree } from './BranchTree.js';

interface Props {
  ctx: RepoContext;
  lastCommit: LastCommit | null;
  lastFetch: Date | null;
  version: string;
  provider?: string;
  cwd: string;
  graphLimit?: number;
}

function relativeTime(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function StatusDashboard({ ctx, lastCommit, lastFetch, version, provider, cwd, graphLimit = 3 }: Props): JSX.Element {
  const width = Math.min(process.stdout.columns ?? 80, 78);
  const innerWidth = width - 6;
  const brColor = branchColor(ctx.branch);
  const isProtected = ctx.branch === 'main' || ctx.branch === 'master' || ctx.branch === 'develop';

  const conventionName =
    ctx.convention.type === 'conventional' ? 'Conventional'
    : ctx.convention.type === 'angular' ? 'Angular'
    : ctx.convention.type;

  const msgTrunc = lastCommit
    ? (lastCommit.message.length > 45 ? lastCommit.message.slice(0, 44) + '…' : lastCommit.message)
    : null;

  const hasDirty = ctx.conflictsActive || ctx.stagedFiles.length > 0 || ctx.unstagedFiles.length > 0 || ctx.untrackedFiles.length > 0;

  return (
    <Box flexDirection="column" width={width}>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.border}
        paddingX={1}
        width={width}
        marginBottom={0}
      >
        {/* Header row: repo name + version */}
        <Box>
          <Text color={theme.muted}>📁  </Text>
          <Text bold color="white">{ctx.name}</Text>
          <Text color={theme.muted}>{'  ·  git-smart-flow v' + version}</Text>
        </Box>

        {/* Branch row */}
        <Box>
          <Text color={theme.muted}>🌿  </Text>
          <Text bold color={brColor}>{ctx.branch}</Text>
          {ctx.aheadCount > 0 && <Text color={theme.success}>  ↑{ctx.aheadCount}</Text>}
          {ctx.behindCount > 0 && <Text color={theme.error}>  ↓{ctx.behindCount}</Text>}
          {isProtected && <Text color={theme.warning}>  ⚠ PROTECTED</Text>}
          <Text color={theme.muted}>{'  ·  ⚡ ' + conventionName}</Text>
          {provider && provider !== 'heuristic' && <Text color={theme.muted}>{'  ·  🤖 ' + provider}</Text>}
        </Box>

        {/* Last commit row */}
        {lastCommit ? (
          <Box>
            <Text color={theme.muted}>🕐  </Text>
            <Text color={theme.muted}>{lastCommit.shortSha}  </Text>
            <Text color="#d1d5db">"{msgTrunc}"</Text>
            <Text color={theme.muted}>{'  ' + lastCommit.ago}</Text>
          </Box>
        ) : (
          <Box>
            <Text color={theme.muted}>🕐  </Text>
            <Text color={theme.muted}>(no commits yet)</Text>
          </Box>
        )}

        {/* Divider */}
        <Text color={theme.border}>{'─'.repeat(innerWidth)}</Text>

        {/* Working tree status row */}
        <Box>
          {ctx.conflictsActive && <Text color={theme.error}>✖ CONFLICTS  </Text>}
          {ctx.stagedFiles.length > 0 && (
            <Text color={theme.warning}>{'● ' + ctx.stagedFiles.length + ' staged  '}</Text>
          )}
          {ctx.unstagedFiles.length > 0 && (
            <Text color={theme.warning}>{'△ ' + ctx.unstagedFiles.length + ' modified  '}</Text>
          )}
          {ctx.untrackedFiles.length > 0 && (
            <Text color={theme.muted}>{'○ ' + ctx.untrackedFiles.length + ' untracked  '}</Text>
          )}
          {!hasDirty && <Text color={theme.success}>✔ clean  </Text>}
          <Text color={theme.muted}>
            {lastFetch ? '· fetched ' + relativeTime(lastFetch) : '· never fetched'}
          </Text>
        </Box>
      </Box>

      {/* Commit graph */}
      <BranchTree cwd={cwd} limit={graphLimit} showMeta />
    </Box>
  );
}
