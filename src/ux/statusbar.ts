import chalk from 'chalk';
import { spawnSync } from 'child_process';
import { basename } from 'path';
import { isCI } from './renderer.js';
import { branchColor, theme } from './theme.js';

export function printStatusBar(cwd = process.cwd()): void {
  if (isCI() || !process.stdout.isTTY) return;

  const r = spawnSync('git', ['status', '--porcelain=v2', '--branch'], {
    cwd,
    encoding: 'utf-8',
    stdio: 'pipe',
  });

  const repoName = chalk.bold.hex('#ff79c6')(basename(cwd));
  const width = Math.min(process.stdout.columns ?? 80, 100);

  if (r.status !== 0) {
    process.stdout.write(`📁 ${repoName}\n`);
    return;
  }

  let branch = 'HEAD',
    ahead = 0,
    behind = 0,
    modified = 0;
  for (const line of (r.stdout ?? '').split('\n')) {
    if (line.startsWith('# branch.head ')) branch = line.slice(14).trim();
    if (line.startsWith('# branch.ab ')) {
      const m = line.match(/\+(\d+) -(\d+)/);
      if (m) {
        ahead = +(m[1] ?? 0);
        behind = +(m[2] ?? 0);
      }
    }
    if (line.startsWith('1 ') || line.startsWith('2 ') || line.startsWith('? ')) modified++;
  }

  const branchPart = chalk.hex(branchColor(branch))(`(${branch})`);
  const modPart = modified > 0 ? chalk.yellow(`±${modified}`) : chalk.dim('✓');

  const parts: string[] = [repoName, branchPart, modPart];
  if (ahead > 0) parts.push(chalk.hex(theme.success)(`↑${ahead}`));
  if (behind > 0) parts.push(chalk.hex(theme.error)(`↓${behind}`));

  process.stdout.write(parts.join('  ') + '\n');
  process.stdout.write(chalk.dim('─'.repeat(width)) + '\n');
}
