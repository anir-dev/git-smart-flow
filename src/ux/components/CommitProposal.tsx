import { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { Select, TextInput } from '@inkjs/ui';
import type { CommitProposal, ValidationResult } from '../../types/index.js';
import { commitTypeColor, theme } from '../theme.js';
import { useActivation } from '../hooks/useActivation.js';

const COMMIT_TYPES = [
  { value: 'feat', label: 'feat      — nueva funcionalidad' },
  { value: 'fix', label: 'fix       — corrección de bug' },
  { value: 'docs', label: 'docs      — documentación' },
  { value: 'style', label: 'style     — formato, sin lógica' },
  { value: 'refactor', label: 'refactor  — refactorización' },
  { value: 'test', label: 'test      — tests' },
  { value: 'chore', label: 'chore     — mantenimiento, deps' },
  { value: 'ci', label: 'ci        — CI/CD' },
  { value: 'perf', label: 'perf      — rendimiento' },
  { value: 'build', label: 'build     — sistema de build' },
  { value: 'revert', label: 'revert    — revertir commit' },
];

const VALID_TYPES = new Set(COMMIT_TYPES.map((t) => t.value));

type CommitAction = 'accept' | 'edit' | 'regenerate' | 'context' | 'cancel';
type Mode = 'menu' | 'guided-type' | 'guided-scope' | 'guided-desc' | 'regen';

interface Props {
  proposal: CommitProposal;
  stagedCount: number;
  linesAdded?: number;
  linesRemoved?: number;
  branchType?: string;
  onAction: (action: CommitAction, extra?: string) => void;
}

function ValidationRow({
  status,
  label,
  value,
}: {
  status: 'ok' | 'warn' | 'error';
  label: string;
  value?: string;
}): JSX.Element {
  const icon =
    status === 'ok' ? (
      <Text color={theme.success}>✅</Text>
    ) : status === 'warn' ? (
      <Text color={theme.warning}>⚠️ </Text>
    ) : (
      <Text color={theme.error}>❌</Text>
    );

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

function buildValidations(
  msg: string,
  validation: ValidationResult,
  maxLen: number
): Array<{ status: 'ok' | 'warn' | 'error'; label: string; value?: string }> {
  const header = msg.split('\n')[0] ?? '';
  const { type, scope } = parseCommitHeader(header);
  const pct = header.length / maxLen;

  const lenStatus = pct > 1 ? 'error' : pct > 0.8 ? 'warn' : 'ok';
  const lenLabel = `${header.length} / ${maxLen} caracteres`;

  return [
    { status: type ? 'ok' : 'warn', label: 'Tipo válido', value: type || '(no detectado)' },
    { status: scope ? 'ok' : 'warn', label: 'Scope detectado', value: scope || 'ninguno' },
    { status: lenStatus, label: 'Header', value: lenLabel },
    ...validation.errors.map((e) => ({ status: 'error' as const, label: 'Error', value: e })),
    ...validation.warnings.map((w) => ({ status: 'warn' as const, label: 'Aviso', value: w })),
  ];
}

export function CommitProposalView({
  proposal,
  stagedCount,
  linesAdded,
  linesRemoved,
  branchType,
  onAction,
}: Props): JSX.Element {
  const isActive = useActivation();
  const [mode, setMode] = useState<Mode>('menu');

  // Resets to false on every mode change to prevent ghost key events bleeding
  // from one step's Enter into the next step's input.
  const [stepActive, setStepActive] = useState(false);
  useEffect(() => {
    if (mode === 'menu') return;
    setStepActive(false);
    const t = setTimeout(() => setStepActive(true), 150);
    return () => clearTimeout(t);
  }, [mode]);

  const header = proposal.message.split('\n')[0] ?? '';
  const { type: parsedType, scope: parsedScope, desc: parsedDesc } = parseCommitHeader(header);

  // Infer type from branch prefix, falling back to what the AI generated
  const inferredType =
    branchType && VALID_TYPES.has(branchType) ? branchType : parsedType || 'feat';

  const [guidedType, setGuidedType] = useState(inferredType);
  const [guidedScope, setGuidedScope] = useState(parsedScope);
  const [guidedDesc, setGuidedDesc] = useState(parsedDesc);
  const [regenHint, setRegenHint] = useState('');

  const width = Math.min(process.stdout.columns ?? 80, 78);
  const typeColor = commitTypeColor(parsedType);
  const validations = buildValidations(proposal.message, proposal.validation, 100);

  // Put the current/inferred type first so pressing Enter immediately accepts it
  const typeOptions = [
    { value: guidedType, label: `${guidedType.padEnd(10)} ← actual` },
    ...COMMIT_TYPES.filter((t) => t.value !== guidedType),
  ];

  const menuOptions = [
    { label: 'Aceptar y commitear', value: 'accept' },
    { label: 'Editar mensaje', value: 'edit' },
    { label: 'Regenerar con otra instrucción', value: 'regenerate' },
    { label: 'Ver contexto enviado a la IA', value: 'context' },
    { label: 'Cancelar', value: 'cancel' },
  ];

  if (mode === 'guided-type') {
    return (
      <Box flexDirection="column" width={width} paddingX={1}>
        <Text bold color={theme.accent}>
          Tipo de commit
        </Text>
        <Text color={theme.muted}>{'─'.repeat(40)}</Text>
        <Text> </Text>
        <Select
          isDisabled={!stepActive}
          options={typeOptions}
          onChange={(val) => {
            setGuidedType(val);
            setMode('guided-scope');
          }}
        />
        <Text color={theme.muted}> ↑↓ navegar Enter seleccionar</Text>
      </Box>
    );
  }

  if (mode === 'guided-scope') {
    return (
      <Box flexDirection="column" width={width} paddingX={1}>
        <Text bold color={theme.accent}>
          Scope <Text color={theme.muted}>(opcional — Enter para omitir)</Text>
        </Text>
        <Text color={theme.muted}>{'─'.repeat(40)}</Text>
        <TextInput
          isDisabled={!stepActive}
          defaultValue={guidedScope}
          placeholder="auth, api, ui..."
          onSubmit={(val) => {
            setGuidedScope(val);
            setMode('guided-desc');
          }}
        />
      </Box>
    );
  }

  if (mode === 'guided-desc') {
    return (
      <Box flexDirection="column" width={width} paddingX={1}>
        <Text bold color={theme.accent}>
          Descripción <Text color={theme.muted}>(imperativo, tiempo presente)</Text>
        </Text>
        <Text color={theme.muted}>{'─'.repeat(40)}</Text>
        <TextInput
          isDisabled={!stepActive}
          defaultValue={guidedDesc}
          placeholder="add user authentication"
          onSubmit={(val) => {
            const desc = val.trim();
            if (!desc) return;
            const newMsg = `${guidedType}${guidedScope.trim() ? `(${guidedScope.trim()})` : ''}: ${desc}`;
            setMode('menu');
            onAction('edit', newMsg);
          }}
        />
        <Text color={theme.muted}> Enter para confirmar</Text>
      </Box>
    );
  }

  if (mode === 'regen') {
    return (
      <Box flexDirection="column" width={width} paddingX={1}>
        <Text bold color={theme.accent}>
          Instrucción adicional para la IA
        </Text>
        <Text color={theme.muted}>{'─'.repeat(40)}</Text>
        <TextInput
          isDisabled={!stepActive}
          defaultValue={regenHint}
          placeholder="ej: hazlo más corto, añade más contexto..."
          onSubmit={(val) => {
            setRegenHint(val);
            setMode('menu');
            onAction('regenerate', val);
          }}
        />
        <Text color={theme.muted}>
          {' '}
          Enter para confirmar · vacío para regenerar sin instrucción
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width={width}>
      {/* Proposed message box */}
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.accent}
        paddingX={1}
        marginBottom={1}
      >
        <Text color={theme.muted}>Mensaje propuesto</Text>
        <Text> </Text>
        <Text bold color={typeColor}>
          {header}
        </Text>
        {proposal.message
          .split('\n')
          .slice(1)
          .filter(Boolean)
          .map((line, i) => (
            <Text key={i} color="#d1d5db">
              {' '}
              {line}
            </Text>
          ))}
        <Text> </Text>
      </Box>

      {/* Validations */}
      <Text bold color="#d1d5db">
        Validaciones
      </Text>
      <Text color={theme.muted}>{'─'.repeat(42)}</Text>
      {validations.map((v, i) => (
        <ValidationRow key={i} status={v.status} label={v.label} value={v.value} />
      ))}
      <Text> </Text>

      {/* Context summary */}
      <Text bold color="#d1d5db">
        Contexto enviado a la IA
      </Text>
      <Text color={theme.muted}>{'─'.repeat(42)}</Text>
      <Text color={theme.muted}>
        📁 {stagedCount} archivo(s)
        {linesAdded !== undefined && (
          <Text>
            {' '}
            · <Text color={theme.success}>+{linesAdded}</Text>
          </Text>
        )}
        {linesRemoved !== undefined && (
          <Text>
            {' '}
            / <Text color={theme.error}>-{linesRemoved}</Text>
          </Text>
        )}{' '}
        · {proposal.provider}
      </Text>
      <Text> </Text>

      <Select
        isDisabled={!isActive}
        options={menuOptions}
        onChange={(val) => {
          if (val === 'edit') {
            setMode('guided-type');
            return;
          }
          if (val === 'regenerate') {
            setMode('regen');
            return;
          }
          onAction(val as CommitAction);
        }}
      />
    </Box>
  );
}
