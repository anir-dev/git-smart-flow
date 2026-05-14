import chalk from 'chalk';
import { createInterface } from 'readline';

export interface MenuItem {
  key: string;
  label: string;
  action: () => Promise<void>;
}

export async function showMenu(title: string, items: MenuItem[]): Promise<void> {
  console.log(`\n${chalk.bold(title)}\n`);
  for (const item of items) {
    console.log(`  ${chalk.cyan(item.key)}.  ${item.label}`);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  return new Promise((resolve) => {
    rl.question('\n' + chalk.gray('Select option: '), async (answer) => {
      rl.close();
      const selected = items.find((i) => i.key === answer.trim());
      if (selected) {
        await selected.action();
      } else {
        console.log(chalk.yellow('Invalid option.'));
      }
      resolve();
    });
  });
}
