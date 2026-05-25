import type { JSX } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../theme.js';

interface Props {
  version: string;
}

const LOGO_NARROW = ' ___  ___ ___ \n/ __||  _|| __|\n|(_ |___ || __|\n \\___||___||___|';

const LOGO_WIDE =
  '  ██████╗ ███████╗███████╗\n ██╔════╝ ██╔════╝██╔════╝\n ██║  ███╗███████╗█████╗  \n ██║   ██║╚════██║██╔══╝  \n ╚██████╔╝███████║██║     \n  ╚═════╝ ╚══════╝╚═╝     ';

function renderLogo(narrow: boolean): string {
  return narrow ? LOGO_NARROW : LOGO_WIDE;
}

export function Logo({ version }: Props): JSX.Element {
  const cols = process.stdout.columns ?? 80;
  const narrow = cols < 80;
  const art = renderLogo(narrow);

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={theme.accent}>{art}</Text>
      <Box marginTop={-1} paddingLeft={2} gap={1}>
        <Text bold color="white">
          Git Smart Flow
        </Text>
        <Text color={theme.muted}>v{version}</Text>
      </Box>
      <Box paddingLeft={2}>
        <Text color={theme.muted}>The smart way to use Git</Text>
      </Box>
    </Box>
  );
}
