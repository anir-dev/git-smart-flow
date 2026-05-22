import { Box, Text } from 'ink';
import { theme } from '../theme.js';

export interface ValidationItem {
  status: 'ok' | 'warn' | 'error' | 'info';
  label: string;
  detail?: string;
}

export interface ValidationSection {
  title: string;
  items: ValidationItem[];
}

interface Props {
  repoName: string;
  sections: ValidationSection[];
}

function StatusIcon({ status }: { status: ValidationItem['status'] }): JSX.Element {
  const map = {
    ok: <Text color={theme.success}>✅</Text>,
    warn: <Text color={theme.warning}>⚠️ </Text>,
    error: <Text color={theme.error}>❌</Text>,
    info: <Text color={theme.info}>ℹ </Text>,
  };
  return map[status];
}

export function ValidationReport({ repoName, sections }: Props): JSX.Element {
  const width = Math.min(process.stdout.columns ?? 80, 78);
  const divider = '─'.repeat(Math.min(width - 2, 46));
  const allOk = sections.every((s) =>
    s.items.every((i) => i.status === 'ok' || i.status === 'info')
  );

  return (
    <Box flexDirection="column" width={width}>
      <Text bold color="white">
        Validación del repositorio — {repoName}
      </Text>
      <Text color={theme.muted}>{'━'.repeat(Math.min(repoName.length + 30, width - 2))}</Text>
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
              {item.detail && <Text color={theme.muted}>{item.detail}</Text>}
            </Box>
          ))}
        </Box>
      ))}

      <Box marginTop={1}>
        {allOk ? (
          <Text bold color={theme.success}>
            ✔ Sin problemas detectados
          </Text>
        ) : (
          <Text bold color={theme.warning}>
            ⚠ Revisa los elementos marcados antes de continuar
          </Text>
        )}
      </Box>
    </Box>
  );
}
