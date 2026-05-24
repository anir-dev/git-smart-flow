import type { JSX } from 'react';
import { createInterface } from 'readline';
import { isCI } from './renderer.js';

// ── Readline fallbacks (CI / no-TTY) ──────────────────────────────────────

async function plainSelectPrompt(message: string, choices: string[]): Promise<string> {
  return new Promise((resolve) => {
    console.log(`\n${message}`);
    choices.forEach((c, i) => console.log(`  ${i + 1}. ${c}`));
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question('\nEnter number: ', (answer) => {
      rl.close();
      const idx = parseInt(answer, 10) - 1;
      resolve(choices[idx] ?? choices[0] ?? '');
    });
  });
}

async function plainConfirmPrompt(message: string, defaultYes: boolean): Promise<boolean> {
  return new Promise((resolve) => {
    const hint = defaultYes ? '[Y/n]' : '[y/N]';
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${message} ${hint} `, (answer) => {
      rl.close();
      if (!answer.trim()) {
        resolve(defaultYes);
        return;
      }
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

async function plainInputPrompt(message: string, defaultValue?: string): Promise<string> {
  return new Promise((resolve) => {
    const hint = defaultValue ? ` (${defaultValue})` : '';
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${message}${hint}: `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

async function plainPasswordPrompt(message: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    process.stdout.write(`${message}: `);
    process.stdin.setRawMode?.(true);
    process.stdin.once('data', (data: Buffer) => {
      process.stdin.setRawMode?.(false);
      rl.close();
      process.stdout.write('\n');
      resolve(data.toString().trim());
    });
  });
}

async function plainMultiselectPrompt(message: string, choices: string[]): Promise<string[]> {
  return new Promise((resolve) => {
    console.log(`\n${message} (comma-separated numbers, e.g. 1,3):`);
    choices.forEach((c, i) => console.log(`  ${i + 1}. ${c}`));
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question('\nEnter numbers: ', (answer) => {
      rl.close();
      const selected = answer
        .split(',')
        .map((s) => parseInt(s.trim(), 10) - 1)
        .filter((i) => i >= 0 && i < choices.length)
        .map((i) => choices[i] ?? '');
      resolve(selected);
    });
  });
}

// ── Ink helper ─────────────────────────────────────────────────────────────

async function ri<T>(factory: (resolve: (v: T) => void) => JSX.Element): Promise<T> {
  const { renderInteractive } = await import('./renderer.js');
  return renderInteractive<T>(factory);
}

// ── Public API (Ink for TTY, readline for CI) ──────────────────────────────

export async function selectPrompt(message: string, choices: string[]): Promise<string> {
  if (isCI()) return plainSelectPrompt(message, choices);
  const React = (await import('react')).default;
  const { useState, useEffect } = await import('react');
  const { Box, Text } = await import('ink');
  const { Select } = await import('@inkjs/ui');
  const { theme } = await import('./theme.js');
  const options = choices.map((c) => ({ label: c, value: c }));
  return ri<string>((resolve) => {
    function SelectPrompt(): JSX.Element {
      const [active, setActive] = useState(false);
      useEffect(() => {
        const t = setTimeout(() => setActive(true), 120);
        return () => clearTimeout(t);
      }, []);
      return React.createElement(
        Box,
        { flexDirection: 'column', paddingX: 1 },
        React.createElement(Text, { bold: true, color: theme.muted }, message),
        React.createElement(Text),
        React.createElement(Select, { isDisabled: !active, options, onChange: resolve }),
        React.createElement(Text, { color: theme.muted }, '  ↑↓ navegar   Enter seleccionar')
      );
    }
    return React.createElement(SelectPrompt, null);
  });
}

export async function confirmPrompt(message: string, defaultYes = true): Promise<boolean> {
  if (isCI()) return plainConfirmPrompt(message, defaultYes);
  const React = (await import('react')).default;
  const { useState, useEffect } = await import('react');
  const { Box, Text } = await import('ink');
  const { ConfirmInput } = await import('@inkjs/ui');
  const { theme } = await import('./theme.js');
  return ri<boolean>((resolve) => {
    function ConfirmPrompt(): JSX.Element {
      const [active, setActive] = useState(false);
      useEffect(() => {
        const t = setTimeout(() => setActive(true), 120);
        return () => clearTimeout(t);
      }, []);
      return React.createElement(
        Box,
        { flexDirection: 'row', paddingX: 1 },
        React.createElement(Text, { color: theme.muted }, message + '  '),
        React.createElement(ConfirmInput, {
          isDisabled: !active,
          defaultChoice: defaultYes ? 'confirm' : 'cancel',
          onConfirm: () => resolve(true),
          onCancel: () => resolve(false),
        })
      );
    }
    return React.createElement(ConfirmPrompt, null);
  });
}

export async function inputPrompt(message: string, defaultValue?: string): Promise<string> {
  if (isCI()) return plainInputPrompt(message, defaultValue);
  const React = (await import('react')).default;
  const { useState, useEffect } = await import('react');
  const { Box, Text } = await import('ink');
  const { TextInput } = await import('@inkjs/ui');
  const { theme } = await import('./theme.js');
  return ri<string>((resolve) => {
    function InputPrompt(): JSX.Element {
      const [active, setActive] = useState(false);
      useEffect(() => {
        const t = setTimeout(() => setActive(true), 120);
        return () => clearTimeout(t);
      }, []);
      return React.createElement(
        Box,
        { flexDirection: 'column', paddingX: 1 },
        React.createElement(
          Text,
          { color: theme.muted },
          message + (defaultValue ? `  (${defaultValue})` : '')
        ),
        React.createElement(TextInput, {
          isDisabled: !active,
          defaultValue: defaultValue ?? '',
          placeholder: defaultValue ?? '',
          onSubmit: (val: string) => resolve(val || defaultValue || ''),
        })
      );
    }
    return React.createElement(InputPrompt, null);
  });
}

export async function passwordPrompt(message: string): Promise<string> {
  if (isCI()) return plainPasswordPrompt(message);
  const React = (await import('react')).default;
  const { useState, useEffect } = await import('react');
  const { Box, Text } = await import('ink');
  const { PasswordInput } = await import('@inkjs/ui');
  const { theme } = await import('./theme.js');
  return ri<string>((resolve) => {
    function PasswordPrompt(): JSX.Element {
      const [active, setActive] = useState(false);
      useEffect(() => {
        const t = setTimeout(() => setActive(true), 120);
        return () => clearTimeout(t);
      }, []);
      return React.createElement(
        Box,
        { flexDirection: 'column', paddingX: 1 },
        React.createElement(Text, { color: theme.muted }, message),
        React.createElement(PasswordInput, {
          isDisabled: !active,
          placeholder: '••••••••',
          onSubmit: (val: string) => resolve(val),
        })
      );
    }
    return React.createElement(PasswordPrompt, null);
  });
}

export async function multiselectPrompt(message: string, choices: string[]): Promise<string[]> {
  if (isCI()) return plainMultiselectPrompt(message, choices);
  const React = (await import('react')).default;
  const { useState, useEffect } = await import('react');
  const { Box, Text } = await import('ink');
  const { MultiSelect } = await import('@inkjs/ui');
  const { theme } = await import('./theme.js');
  const options = choices.map((c) => ({ label: c, value: c }));
  return ri<string[]>((resolve) => {
    function MultiSelectPrompt(): JSX.Element {
      const [active, setActive] = useState(false);
      useEffect(() => {
        const t = setTimeout(() => setActive(true), 120);
        return () => clearTimeout(t);
      }, []);
      return React.createElement(
        Box,
        { flexDirection: 'column', paddingX: 1 },
        React.createElement(Text, { bold: true, color: theme.muted }, message),
        React.createElement(Text, { color: theme.muted }, '  Space seleccionar · Enter confirmar'),
        React.createElement(MultiSelect, {
          isDisabled: !active,
          options,
          visibleOptionCount: 15,
          onSubmit: (values: string[]) => resolve(values),
        })
      );
    }
    return React.createElement(MultiSelectPrompt, null);
  });
}

// ── Smart file selector ────────────────────────────────────────────────────
// TTY: Ink MultiSelect. CI: directory-grouping readline flow.

export async function smartFileSelectPrompt(message: string, files: string[]): Promise<string[]> {
  if (files.length === 0) return [];

  if (files.length === 1) {
    const ok = await confirmPrompt(`Stage "${files[0] ?? ''}"?`, true);
    return ok ? [files[0] ?? ''] : [];
  }

  if (isCI()) return directoryModeSelect(message, files);

  const React = (await import('react')).default;
  const { useState, useEffect } = await import('react');
  const { Box, Text } = await import('ink');
  const { MultiSelect } = await import('@inkjs/ui');
  const { theme } = await import('./theme.js');

  const options = [
    { label: `★ Stage ALL (${files.length} files)`, value: '__ALL__' },
    ...files.map((f) => ({ label: f, value: f })),
  ];

  return ri<string[]>((resolve) => {
    function FileSelectPrompt(): JSX.Element {
      const [active, setActive] = useState(false);
      useEffect(() => {
        const t = setTimeout(() => setActive(true), 120);
        return () => clearTimeout(t);
      }, []);
      return React.createElement(
        Box,
        { flexDirection: 'column', paddingX: 1 },
        React.createElement(
          Text,
          { bold: true, color: theme.muted },
          `${message}  [${files.length} file(s)]`
        ),
        React.createElement(Text, { color: theme.muted }, '  Space seleccionar · Enter confirmar'),
        React.createElement(MultiSelect, {
          isDisabled: !active,
          options,
          visibleOptionCount: 20,
          onSubmit: (values: string[]) => {
            const selected = values.filter((v) => v !== '__ALL__');
            if (values.includes('__ALL__')) resolve(files);
            else if (selected.length > 0) resolve(selected);
          },
        })
      );
    }
    return React.createElement(FileSelectPrompt, null);
  });
}

// ── CI directory-mode selector (readline) ─────────────────────────────────

const PAGE_SIZE = 30;

function groupByTopDir(files: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const f of files) {
    const slash = f.indexOf('/');
    const key = slash > 0 ? f.slice(0, slash + 1) : '(root)';
    if (!map.has(key)) map.set(key, []);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    map.get(key)!.push(f);
  }
  return map;
}

async function ask(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, (a) => {
      rl.close();
      resolve(a.trim());
    });
  });
}

async function directoryModeSelect(message: string, files: string[]): Promise<string[]> {
  const dirMap = groupByTopDir(files);
  const dirs = [...dirMap.entries()].sort(([a], [b]) => a.localeCompare(b));
  const multiDir = dirs.length > 1;

  console.log(`\n${message}  [${files.length} file(s)]\n`);
  console.log(`  a.  Stage ALL ${files.length} files`);
  if (multiDir) {
    dirs.forEach(([dir, dirFiles], i) => {
      console.log(`  ${String(i + 1).padStart(2)}.  ${dir.padEnd(28)}  ${dirFiles.length} file(s)`);
    });
  }
  console.log('   f.  Browse / select individual files');
  console.log('   0.  Cancel — stage nothing');
  if (multiDir) {
    console.log('\n  Tip: combine with commas, e.g. "1,3" stages those two directories.');
  }

  const raw = await ask('\nChoice: ');
  const tokens = raw ? raw.split(',').map((t) => t.trim().toLowerCase()) : [];
  if (!tokens.length || tokens.includes('0')) return [];
  if (tokens.includes('a')) return files;

  const selected: string[] = [];
  for (const token of tokens) {
    if (token === 'f') {
      const picked = await browseFilesPrompt(files);
      selected.push(...picked);
      continue;
    }
    if (!multiDir) continue;
    const idx = parseInt(token, 10) - 1;
    if (idx < 0 || idx >= dirs.length) continue;
    const dirEntry = dirs[idx];
    if (!dirEntry) continue;
    const [dirName, dirFiles] = dirEntry;

    if (dirFiles.length <= 15) {
      const picked = await plainMultiselectPrompt(
        `Files in ${dirName} (${dirFiles.length})`,
        dirFiles
      );
      selected.push(...picked);
    } else {
      const all = await plainConfirmPrompt(
        `Stage all ${dirFiles.length} file(s) in ${dirName}?`,
        true
      );
      if (all) {
        selected.push(...dirFiles);
      } else {
        const sub = await directoryModeSelect(`Select in ${dirName}`, dirFiles);
        selected.push(...sub);
      }
    }
  }

  return [...new Set(selected)];
}

async function browseFilesPrompt(files: string[]): Promise<string[]> {
  const total = Math.ceil(files.length / PAGE_SIZE);
  let page = 0;
  const selected = new Set<string>();

  while (true) {
    const s = page * PAGE_SIZE;
    const e = Math.min(s + PAGE_SIZE, files.length);
    console.log(`\nFiles ${s + 1}–${e} of ${files.length}  (page ${page + 1}/${total}):`);
    for (let i = s; i < e; i++) {
      const fi = files[i] ?? '';
      const mark = selected.has(fi) ? '✓' : ' ';
      console.log(`  ${mark} ${String(i + 1).padStart(5)}.  ${fi}`);
    }

    const hints = ['numbers to toggle (e.g. 1,3,5)'];
    if (page < total - 1) hints.push('"n" next');
    if (page > 0) hints.push('"p" prev');
    hints.push('"done" confirm');

    const ans = await ask(`\n(${hints.join(' · ')}) > `);
    if (ans === 'done' || ans === '') break;
    if (ans === 'n' && page < total - 1) {
      page++;
      continue;
    }
    if (ans === 'p' && page > 0) {
      page--;
      continue;
    }

    for (const t of ans.split(',')) {
      const i = parseInt(t.trim(), 10) - 1;
      if (i >= 0 && i < files.length) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const f = files[i]!;
        if (selected.has(f)) selected.delete(f);
        else selected.add(f);
      }
    }
  }

  return [...selected];
}
