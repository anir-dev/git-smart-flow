import type { JSX } from 'react';
import { isCI } from './renderer.js';

export interface MenuItem {
  key: string;
  label: string;
  action: () => Promise<void>;
}

export async function showMenu(title: string, items: MenuItem[]): Promise<void> {
  if (isCI()) {
    return plainShowMenu(title, items);
  }
  return inkShowMenu(title, items);
}

async function inkShowMenu(title: string, items: MenuItem[]): Promise<void> {
  const React = (await import('react')).default;
  const { useState, useEffect } = await import('react');
  const { Box, Text } = await import('ink');
  const { Select } = await import('@inkjs/ui');
  const { renderInteractive } = await import('./renderer.js');
  const { theme } = await import('./theme.js');

  const options = items.map((i) => ({ label: i.label, value: i.key }));

  const selectedKey = await renderInteractive<string>((resolve) => {
    function MenuUI(): JSX.Element {
      const [active, setActive] = useState(false);
      useEffect(() => {
        const t = setTimeout(() => setActive(true), 120);
        return () => clearTimeout(t);
      }, []);
      return React.createElement(
        Box,
        { flexDirection: 'column', paddingX: 1 },
        React.createElement(Text, { bold: true, color: 'white' }, title),
        React.createElement(Text),
        React.createElement(Select, { isDisabled: !active, options, onChange: resolve }),
        React.createElement(Text, { color: theme.muted }, '  ↑↓ navegar   Enter seleccionar')
      );
    }
    return React.createElement(MenuUI, null) as JSX.Element;
  });

  const selected = items.find((i) => i.key === selectedKey);
  if (selected) await selected.action();
}

async function plainShowMenu(title: string, items: MenuItem[]): Promise<void> {
  const chalk = (await import('chalk')).default;
  const { createInterface } = await import('readline');

  console.log(`\n${chalk.bold(title)}\n`);
  for (const item of items) {
    console.log(`  ${chalk.cyan(item.key)}.  ${item.label}`);
  }

  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question('\n' + chalk.gray('Select option: '), (answer) => {
      rl.close();
      const selected = items.find((i) => i.key === answer.trim());
      if (selected) {
        void selected
          .action()
          .then(resolve)
          .catch(() => resolve());
      } else {
        console.log(chalk.yellow('Invalid option.'));
        resolve();
      }
    });
  });
}
