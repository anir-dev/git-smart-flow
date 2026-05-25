import type { JSX } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../theme.js';

interface Props {
  version: string;
}

export function Logo({ version }: Props): JSX.Element {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box gap={1} paddingX={1}>
        <Text color={theme.accent} bold>
          ◆
        </Text>
        <Text bold color="white">
          Git Smart Flow
        </Text>
        <Text color={theme.muted}>{'v' + version}</Text>
      </Box>
      <Box paddingLeft={4}>
        <Text color={theme.muted}>The smart way to use Git</Text>
      </Box>
    </Box>
  );
}
