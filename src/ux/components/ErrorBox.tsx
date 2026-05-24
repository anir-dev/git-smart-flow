import type { JSX } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../theme.js';

interface Props {
  title?: string;
  messages: string | string[];
}

export function ErrorBox({ title = 'Error', messages }: Props): JSX.Element {
  const lines = Array.isArray(messages) ? messages : [messages];
  const width = Math.min(process.stdout.columns ?? 80, 78);

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={theme.error}
      paddingX={1}
      width={width}
    >
      <Text bold color={theme.error}>
        ✖ {title}
      </Text>
      <Text> </Text>
      {lines.map((line, i) => (
        <Text key={i} color="white">
          {' '}
          {line}
        </Text>
      ))}
    </Box>
  );
}
