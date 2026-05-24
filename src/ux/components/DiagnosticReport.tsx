import type { JSX } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../theme.js';

export interface DiagItem {
  status: 'ok' | 'warn' | 'error' | 'info' | 'muted';
  label: string;
  value?: string;
  active?: boolean;
}

export interface DiagSection {
  title: string;
  items: DiagItem[];
}

interface Props {
  title: string;
  sections: DiagSection[];
  allOk?: boolean;
}

function StatusIcon({ status }: { status: DiagItem['status'] }): JSX.Element {
  const map = {
    ok: <Text color={theme.success}>✅</Text>,
    warn: <Text color={theme.warning}>⚠️ </Text>,
    error: <Text color={theme.error}>❌</Text>,
    info: <Text color={theme.info}>ℹ </Text>,
    muted: <Text color={theme.muted}>──</Text>,
  };
  return map[status];
}

export function DiagnosticReport({ title, sections, allOk }: Props): JSX.Element {
  const width = Math.min(process.stdout.columns ?? 80, 78);
  const divider = '─'.repeat(Math.min(width - 2, 46));

  return (
    <Box flexDirection="column" width={width}>
      <Text bold color="white">
        {title}
      </Text>
      <Text color={theme.muted}>{'━'.repeat(Math.min(title.length + 4, width - 2))}</Text>
      <Text> </Text>

      {sections.map((sec) => (
        <Box key={sec.title} flexDirection="column" marginBottom={1}>
          <Text bold color="#d1d5db">
            {sec.title}
          </Text>
          <Text color={theme.muted}>{divider}</Text>
          {sec.items.map((item, i) => (
            <Box key={i} gap={1}>
              <StatusIcon status={item.status} />
              <Text color="white">{item.label}</Text>
              {item.value && (
                <Text color={item.active ? theme.success : theme.muted}>
                  {item.value}
                  {item.active ? '  ← activo' : ''}
                </Text>
              )}
            </Box>
          ))}
        </Box>
      ))}

      {allOk !== undefined && (
        <Box marginTop={1}>
          {allOk ? (
            <Text bold color={theme.success}>
              ✔ Todo en orden
            </Text>
          ) : (
            <Text bold color={theme.warning}>
              ⚠ Revisa los elementos marcados
            </Text>
          )}
        </Box>
      )}
    </Box>
  );
}
