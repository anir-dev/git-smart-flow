import { Box, Text } from 'ink';
import { Select } from '@inkjs/ui';
import type { SecurityScanResult } from '../../types/index.js';
import { theme } from '../theme.js';
import { useActivation } from '../hooks/useActivation.js';

type SecurityChoice = 'review' | 'continue' | 'cancel';

interface Props {
  scan: SecurityScanResult;
  onChoice: (choice: SecurityChoice) => void;
}

export function SecurityAlert({ scan, onChoice }: Props): JSX.Element {
  const isActive = useActivation();
  const width = Math.min(process.stdout.columns ?? 80, 76);

  const options = [
    { label: 'No, revisar los archivos primero', value: 'review' as SecurityChoice },
    { label: 'Sí, continuar sin IA para estos archivos', value: 'continue' as SecurityChoice },
    { label: 'Cancelar', value: 'cancel' as SecurityChoice },
  ];

  return (
    <Box flexDirection="column" width={width}>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.warning}
        paddingX={1}
        marginBottom={1}
      >
        <Text bold color={theme.warning}>⚠️  Alerta de seguridad</Text>
        <Text> </Text>
        <Text color="white">  Se detectaron posibles secretos en archivos staged:</Text>
        <Text> </Text>
        {scan.detectedSecrets.map((s, i) => (
          <Box key={i} flexDirection="column" marginLeft={2}>
            <Text color={theme.info}>📄  {s.file}</Text>
            <Text color={theme.muted}>     Línea {s.line}:  {s.pattern.replace(/./g, '•').slice(0, 20)}</Text>
          </Box>
        ))}
        {scan.blockedFiles.length > 0 && (
          <>
            <Text> </Text>
            {scan.blockedFiles.map((f, i) => (
              <Box key={i} marginLeft={2}>
                <Text color={theme.error}>🔒  {f}  (bloqueado)</Text>
              </Box>
            ))}
          </>
        )}
        <Text> </Text>
        <Text color={theme.muted}>  Estos archivos NO serán enviados a la IA.</Text>
      </Box>
      <Select isDisabled={!isActive} options={options} onChange={(val) => onChoice(val as SecurityChoice)} />
    </Box>
  );
}
