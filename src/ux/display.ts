import chalk from 'chalk';

export function success(msg: string): void { console.log(chalk.green('✔ ' + msg)); }
export function error(msg: string): void { console.error(chalk.red('✖ ' + msg)); }
export function warning(msg: string): void { console.warn(chalk.yellow('⚠ ' + msg)); }
export function info(msg: string): void { console.log(chalk.blue('ℹ ' + msg)); }
export function secondary(msg: string): void { console.log(chalk.gray(msg)); }

export function section(title: string): void {
  console.log('\n' + chalk.bold.cyan('── ' + title + ' ──'));
}

export function keyValue(key: string, value: string, indent = 0): void {
  const pad = ' '.repeat(indent);
  console.log(`${pad}${chalk.gray(key + ':')} ${chalk.white(value)}`);
}

export function table(rows: Array<[string, string]>): void {
  const maxKey = Math.max(...rows.map(([k]) => k.length));
  for (const [k, v] of rows) {
    console.log(`  ${chalk.gray(k.padEnd(maxKey))}  ${chalk.white(v)}`);
  }
}

export function blank(): void { console.log(); }

export function header(title: string, version: string): void {
  console.log(chalk.bold.cyan(`\n  Git Smart Flow ${chalk.white(`v${version}`)}\n`));
  if (title) console.log(chalk.gray(`  ${title}\n`));
}

export function divider(): void {
  console.log(chalk.gray('─'.repeat(50)));
}
