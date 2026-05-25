import React, { type JSX } from 'react';
import { render, useInput, useApp } from 'ink';

export function isCI(): boolean {
  return (
    !process.stdout.isTTY ||
    process.env['CI'] === 'true' ||
    process.env['GSF_NO_TTY'] === '1' ||
    process.env['GSF_NO_LOGO'] === '1'
  );
}

export function hasLogoFlag(): boolean {
  return process.env['GSF_NO_LOGO'] !== '1' && !process.argv.includes('--no-logo');
}

/** Render a static component (informational display). Does not block — lets process exit naturally. */
export function renderOnce(element: React.ReactElement): void {
  if (isCI()) return;
  const { unmount } = render(element);
  setImmediate(() => unmount());
}

// Tracks consecutive Ctrl+C presses across renderInteractive calls.
// First press cancels the current render; second within 2 s exits the process.
let _sigintCount = 0;
let _sigintTimer: ReturnType<typeof setTimeout> | null = null;

/** Render an interactive component and resolve when done.
 *
 *  Ink sets stdin to raw mode, so Ctrl+C arrives as the ETX byte (\x03), NOT as
 *  SIGINT. We therefore intercept it via useInput inside a thin CancelWrapper
 *  component rather than with process.once('SIGINT', ...).
 *
 *  Using waitUntilExit() ensures Ink fully flushes and restores terminal state
 *  before the next render starts, preventing content ghosting between renders.
 */
export async function renderInteractive<T>(
  factory: (resolve: (value: T) => void) => JSX.Element
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let pendingValue: T | undefined;
    // Set during CancelWrapper's first render; called to exit Ink gracefully.
    let appExitFn: ((error?: Error) => void) | undefined;

    function CancelWrapper({ children }: { children: JSX.Element }): JSX.Element {
      const { exit } = useApp();
      appExitFn = exit;

      useInput((input, key) => {
        if (key.ctrl && input === 'c') {
          _sigintCount++;
          if (_sigintTimer) clearTimeout(_sigintTimer);

          if (_sigintCount >= 2) {
            process.exit(0);
          }

          _sigintTimer = setTimeout(() => {
            _sigintCount = 0;
            _sigintTimer = null;
          }, 2000);

          process.stderr.write('\n  Operación cancelada  ·  Ctrl+C otra vez para salir\n\n');
          exit(new Error('SIGINT'));
        }
      });

      return children;
    }

    const done = (value: T) => {
      pendingValue = value;
      appExitFn?.();
    };

    const innerElement = factory(done);
    const wrapped = React.createElement(CancelWrapper, null, innerElement);
    const { waitUntilExit, cleanup } = render(wrapped, { exitOnCtrlC: false });

    // waitUntilExit resolves after Ink finishes writing cleanup bytes to stdout.
    // This guarantees the terminal is clean before the next render begins.
    void waitUntilExit()
      .then(() => {
        cleanup();
        resolve(pendingValue as T);
      })
      .catch((err: unknown) => {
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      });
  });
}
