import type { JSX } from 'react';
import { Box, Text } from 'ink';
import { MultiSelect } from '@inkjs/ui';
import type { StagedFile } from '../../types/index.js';
import { theme } from '../theme.js';
import { useActivation } from '../hooks/useActivation.js';

interface FileEntry {
  path: string;
  status: StagedFile['status'] | 'untracked' | 'unstaged';
  blocked?: boolean;
}

interface Props {
  files: FileEntry[];
  blockedFiles?: string[];
  onSelect: (paths: string[]) => void;
}

function statusIcon(status: FileEntry['status']): string {
  const map: Record<string, string> = {
    added: 'A',
    modified: 'M',
    deleted: 'D',
    renamed: 'R',
    copied: 'C',
    unknown: '?',
    untracked: '?',
    unstaged: 'M',
  };
  return map[status] ?? '?';
}

function dirOf(filePath: string): string {
  const idx = filePath.lastIndexOf('/');
  return idx >= 0 ? filePath.slice(0, idx) : '';
}

function buildOptions(files: FileEntry[]): { label: string; value: string }[] {
  const options: { label: string; value: string }[] = [];

  if (files.length >= 2) {
    options.push({ label: `📦  Todos los archivos (${files.length})`, value: '__ALL__' });
  }

  // Group by directory
  const dirs = new Map<string, FileEntry[]>();
  for (const f of files) {
    const d = dirOf(f.path);
    if (!dirs.has(d)) dirs.set(d, []);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    dirs.get(d)!.push(f);
  }

  const sortedDirs = [...dirs.entries()].sort(([a], [b]) => a.localeCompare(b));

  for (const [dir, dirFiles] of sortedDirs) {
    // Directory shortcut only when the dir has 2+ files
    if (dirFiles.length >= 2) {
      const dirLabel = dir ? `📁  ${dir}/ (${dirFiles.length})` : `📁  (raíz) (${dirFiles.length})`;
      options.push({ label: dirLabel, value: `__DIR:${dir}` });
    }
    for (const f of dirFiles) {
      const indent = dirFiles.length >= 2 ? '   ' : '';
      options.push({
        label: `${indent}${statusIcon(f.status)}  ${f.path}`,
        value: f.path,
      });
    }
  }

  return options;
}

function expandSelection(selected: string[], allFiles: FileEntry[]): string[] {
  const paths = new Set<string>();

  for (const val of selected) {
    if (val === '__ALL__') {
      for (const f of allFiles) paths.add(f.path);
    } else if (val.startsWith('__DIR:')) {
      const dir = val.slice(6);
      for (const f of allFiles) {
        if (dirOf(f.path) === dir) paths.add(f.path);
      }
    } else {
      paths.add(val);
    }
  }

  return [...paths];
}

export function FileSelector({ files, blockedFiles = [], onSelect }: Props): JSX.Element {
  const isActive = useActivation();
  const selectableFiles = files.filter((f) => !blockedFiles.includes(f.path));
  const blocked = files.filter((f) => blockedFiles.includes(f.path));

  const options = buildOptions(selectableFiles);

  function handleSubmit(selected: string[]): void {
    const paths = expandSelection(selected, selectableFiles);
    if (paths.length === 0) return;
    onSelect(paths);
  }

  return (
    <Box flexDirection="column">
      <Text bold color="white">
        📂 Archivos con cambios
      </Text>
      <Text color={theme.muted}>{'─'.repeat(40)}</Text>

      {blocked.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          {blocked.map((f, i) => (
            <Text key={i} color={theme.muted}>
              {' '}
              🔒 {f.path} <Text color={theme.error}>(bloqueado - secretos)</Text>
            </Text>
          ))}
        </Box>
      )}

      <MultiSelect isDisabled={!isActive} options={options} onSubmit={handleSubmit} />

      <Text color={theme.muted}> Espacio para seleccionar · Enter para confirmar</Text>
    </Box>
  );
}
