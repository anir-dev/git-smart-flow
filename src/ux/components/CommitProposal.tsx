import { useState } from 'react';
import { Box, Text } from 'ink';
import { Select, TextInput } from '@inkjs/ui';
import type { CommitProposal, ValidationResult } from '../../types/index.js';
import { commitTypeColor, theme } from '../theme.js';
import { useActivation } from '../hooks/useActivation.js';

type CommitAction = 'accept' | 'edit' | 'regenerate' | 'context' | 'cancel';

interface Props {
  proposal: CommitProposal;
  stagedCount: number;
  linesAdded?: number;
  linesRemoved?: number;
  onAction: (action: CommitAction, extra?: string) => void;
}

function ValidationRow({ status, label, value }: { status: 'ok' | 'warn' | 'error'; label: string; value?: string }): JSX.Element {
  const icon = status === 'ok'
    ? <Text color={theme.success}>✅</Text>
    : status === 'warn'
    ? <Text color={theme.warning}>⚠️ </Text>
    : <Text color={theme.error}>❌</Text>;

  return (
    <Box gap={1}>
      {icon}
      <Text color="#d1d5db">{label.padEnd(22)}</Text>
      {value && <Text color={theme.muted}>{value}</Text>}
    </Box>
  );
}

function parseCommitHeader(msg: string): { type: string; scope: string; desc: string } {
  const match = msg.match(/^(\w+)(?:\(([^)]*)\))?!?\s*:\s*(.+)/);
  if (match) {
    return { type: match[1] ?? '', scope: match[2] ?? '', desc: match[3] ?? '' };
  }
  return { type: '', scope: '', desc: msg };
}

function buildValidations(msg: string, validation: ValidationResult, maxLen: number): Array<{ status: 'ok' | 'warn' | 'error'; label: string; value?: string }> {
  const header = msg.split('\n')[0] ?? '';
  const { type, scope } = parseCommitHeader(header);
  const pct = header.length / maxLen;

  const lenStatus = pct > 1 ? 'error' : pct > 0.8 ? 'warn' : 'ok';
  const lenLabel = `${header.length} / ${maxLen} caracteres`;

  return [
    { status: type ? 'ok' : 'warn', label: 'Tipo válido', value: type || '(no detectado)' },
    { status: scope ? 'ok' : 'warn', label: 'Scope detectado', value: scope || 'ninguno' },
    { status: lenStatus, label: 'Header', value: lenLabel },
    ...(validation.errors.map((e) => ({ status: 'error' as const, label: 'Error', value: e }))),
    ...(validation.warnings.map((w) => ({ status: 'warn' as const, label: 'Aviso', value: w }))),
  ];
}

export function CommitProposalView({ proposal, stagedCount, linesAdded, linesRemoved, onAction }: Props): JSX.Element {
  const isActive = useActivation();
  const [mode, setMode] = useState<'menu' | 'edit' | 'regen'>('menu');
  const [editValue, setEditValue] = useState(proposal.message.split('\n')[0] ?? '');
  const [regenValue, setRegenValue] = useState('');

  const width = Math.min(process.stdout.columns ?? 80, 78);
  const header = proposal.message.split('\n')[0] ?? '';
  const { type } = parseCommitHeader(header);
  const typeColor = commitTypeColor(type);
  const validations = buildValidations(proposal.message, proposal.validation, 100);

  const options = [
    { label: 'Aceptar y commitear', value: 'accept' },
    { label: 'Editar mensaje', value: 'edit' },
    { label: 'Regenerar con otra instrucción', value: 'regenerate' },
    { label: 'Ver contexto enviado a la IA', value: 'context' },
    { label: 'Cancelar', value: 'cancel' },
  ];

  if (mode === 'edit') {
    return (
      <Box flexDirection="column" width={width}>
        <Text bold color={theme.accent}>Editar mensaje</Text>
        <Text color={theme.muted}>{'─'.repeat(40)}</Text>
        <TextInput
          isDisabled={!isActive}
          defaultValue={editValue}
          placeholder="feat(scope): descripción"
          onSubmit={(val) => {
            setEditValue(val);
            onAction('edit', val);
          }}
        />
        <Text color={theme.muted}>Enter para confirmar</Text>
      </Box>
    );
  }

  if (mode === 'regen') {
    return (
      <Box flexDirection="column" width={width}>
        <Text bold color={theme.accent}>Instrucción adicional para la IA</Text>
        <Text color={theme.muted}>{'─'.repeat(40)}</Text>
        <TextInput
          isDisabled={!isActive}
          defaultValue={regenValue}
          placeholder="ej: hazlo más corto, añade más contexto..."
          onSubmit={(val) => {
            setRegenValue(val);
            onAction('regenerate', val);
          }}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width={width}>
      {/* Proposed message box */}
      <Box flexDirection="column" borderStyle="round" borderColor={theme.accent} paddingX={1} marginBottom={1}>
        <Text color={theme.muted}>Mensaje propuesto</Text>
        <Text> </Text>
        <Text bold color={typeColor}>{header}</Text>
        {proposal.message.split('\n').slice(1).filter(Boolean).map((line, i) => (
          <Text key={i} color="#d1d5db">  {line}</Text>
        ))}
        <Text> </Text>
      </Box>

      {/* Validations */}
      <Text bold color="#d1d5db">Validaciones</Text>
      <Text color={theme.muted}>{'─'.repeat(42)}</Text>
      {validations.map((v, i) => (
        <ValidationRow key={i} status={v.status} label={v.label} value={v.value} />
      ))}
      <Text> </Text>

      {/* Context summary */}
      <Text bold color="#d1d5db">Contexto enviado a la IA</Text>
      <Text color={theme.muted}>{'─'.repeat(42)}</Text>
      <Text color={theme.muted}>
        📁  {stagedCount} archivo(s)
        {linesAdded !== undefined && <Text>  ·  <Text color={theme.success}>+{linesAdded}</Text></Text>}
        {linesRemoved !== undefined && <Text> / <Text color={theme.error}>-{linesRemoved}</Text></Text>}
        {' '}·  {proposal.provider}
      </Text>
      <Text> </Text>

      <Select
        isDisabled={!isActive}
        options={options}
        onChange={(val) => {
          if (val === 'edit') { setMode('edit'); return; }
          if (val === 'regenerate') { setMode('regen'); return; }
          onAction(val as CommitAction);
        }}
      />
    </Box>
  );
}
