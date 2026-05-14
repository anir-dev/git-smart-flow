import ora, { type Ora } from 'ora';

let current: Ora | null = null;

export function startSpinner(text: string): Ora {
  current = ora({ text, spinner: 'dots' }).start();
  return current;
}

export function succeedSpinner(text?: string): void {
  current?.succeed(text);
  current = null;
}

export function failSpinner(text?: string): void {
  current?.fail(text);
  current = null;
}

export function warnSpinner(text?: string): void {
  current?.warn(text);
  current = null;
}

export function stopSpinner(): void {
  current?.stop();
  current = null;
}
