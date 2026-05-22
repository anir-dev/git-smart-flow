/** Lightweight spinner shim — used by commands not yet migrated to Ink. */
import chalk from 'chalk';

let _frame = 0;
const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let _interval: ReturnType<typeof setInterval> | null = null;
let _text = '';

function _write(line: string): void {
  process.stdout.write(`\r${chalk.cyan(line)}` + ' '.repeat(Math.max(0, 60 - line.length)));
}

export function startSpinner(text: string): void {
  _text = text;
  _frame = 0;
  if (_interval) clearInterval(_interval);
  _interval = setInterval(() => {
    _write(`${FRAMES[_frame % FRAMES.length]} ${_text}`);
    _frame++;
  }, 80);
}

export function succeedSpinner(text?: string): void {
  _stop();
  console.log(`\r${chalk.green('✔')} ${text ?? _text}` + ' '.repeat(40));
}

export function failSpinner(text?: string): void {
  _stop();
  console.error(`\r${chalk.red('✖')} ${text ?? _text}` + ' '.repeat(40));
}

export function warnSpinner(text?: string): void {
  _stop();
  console.warn(`\r${chalk.yellow('⚠')} ${text ?? _text}` + ' '.repeat(40));
}

export function stopSpinner(): void {
  _stop();
  process.stdout.write('\r' + ' '.repeat(80) + '\r');
}

function _stop(): void {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
  }
}
