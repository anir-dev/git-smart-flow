import chalk from 'chalk';
import boxen from 'boxen';

// ── Legacy helpers (backward-compatible with existing commands) ────────────

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

// ── New semantic helpers (for CI/pipe-safe output) ─────────────────────────

export function printSuccess(msg: string): void {
  console.log(chalk.green('✔') + ' ' + msg);
}

export function printError(msg: string): void {
  console.error(chalk.red('✖') + ' ' + msg);
}

export function printWarning(msg: string): void {
  console.warn(chalk.yellow('⚠') + ' ' + msg);
}

export function printInfo(msg: string): void {
  console.log(chalk.blue('ℹ') + ' ' + msg);
}

export function printSection(title: string): void {
  const width = Math.min(process.stdout.columns ?? 80, 80);
  const line = '─'.repeat(Math.max(0, width - title.length - 4));
  console.log('\n' + chalk.bold(title) + '  ' + chalk.gray(line));
}

export function printItem(
  status: 'ok' | 'warn' | 'error' | 'info',
  label: string,
  value?: string
): void {
  const icons = { ok: chalk.green('✅'), warn: chalk.yellow('⚠️ '), error: chalk.red('❌'), info: chalk.blue('──') };
  const icon = icons[status];
  const val = value ? '  ' + chalk.gray(value) : '';
  console.log(`  ${icon}  ${label}${val}`);
}

export function printErrorBox(title: string, ...lines: string[]): void {
  const content = lines.join('\n');
  console.error(
    boxen(`${chalk.bold.red(title)}\n\n${content}`, {
      padding: 1,
      borderStyle: 'double',
      borderColor: 'red',
    })
  );
}

export function printSuccessBox(title: string, ...lines: string[]): void {
  const content = lines.join('\n');
  console.log(
    boxen(`${chalk.bold.green(title)}\n\n${content}`, {
      padding: 1,
      borderStyle: 'double',
      borderColor: 'green',
    })
  );
}

export function printWarningBox(title: string, ...lines: string[]): void {
  const content = lines.join('\n');
  console.warn(
    boxen(`${chalk.bold.yellow(title)}\n\n${content}`, {
      padding: 1,
      borderStyle: 'double',
      borderColor: 'yellow',
    })
  );
}
