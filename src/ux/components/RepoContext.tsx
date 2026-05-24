import type { JSX } from 'react';
import { Box, Text } from 'ink';
import type { RepoContext } from '../../types/index.js';
import { branchColor, theme } from '../theme.js';

interface Props {
  ctx: RepoContext;
  provider?: string;
}

export function RepoContextBox({ ctx, provider }: Props): JSX.Element {
  const width = Math.min(process.stdout.columns ?? 80, 60);
  const color = branchColor(ctx.branch);
  const isProtected = ctx.branch === 'main' || ctx.branch === 'master' || ctx.branch === 'develop';

  const aheadStr =
    ctx.aheadCount > 0 ? <Text color={theme.success}> ↑{ctx.aheadCount}</Text> : null;
  const behindStr =
    ctx.behindCount > 0 ? <Text color={theme.error}> ↓{ctx.behindCount}</Text> : null;

  const conventionName =
    ctx.convention.type === 'conventional'
      ? 'Conventional'
      : ctx.convention.type === 'angular'
        ? 'Angular'
        : ctx.convention.type;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.border}
      paddingX={1}
      width={width}
      marginBottom={1}
    >
      <Text>
        <Text color={theme.muted}>📁 </Text>
        <Text bold color="white">
          {ctx.name}
        </Text>
      </Text>
      <Box>
        <Text color={theme.muted}>🌿 </Text>
        <Text color={color}>{ctx.branch}</Text>
        {aheadStr}
        {behindStr}
        {isProtected && <Text color={theme.warning}> ⚠ PROTECTED</Text>}
      </Box>
      <Text>
        <Text color={theme.muted}>⚡ </Text>
        <Text color={theme.info}>{conventionName}</Text>
      </Text>
      <Text>
        <Text color={theme.muted}>🤖 </Text>
        <Text color={theme.muted}>{provider ?? 'Heurístico'}</Text>
      </Text>
    </Box>
  );
}
