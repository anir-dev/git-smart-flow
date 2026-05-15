import { render } from 'ink';
import type React from 'react';

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
  // Allow one render cycle then unmount cleanly
  setImmediate(() => unmount());
}

/** Render an interactive component and resolve when done.
 *  The factory receives a `resolve` callback; call it to unmount and return the value. */
export async function renderInteractive<T>(
  factory: (resolve: (value: T) => void) => React.ReactElement
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let unmountFn: (() => void) | undefined;

    const done = (value: T) => {
      unmountFn?.();
      resolve(value);
    };

    try {
      const element = factory(done);
      const { unmount } = render(element);
      unmountFn = unmount;

      process.once('SIGINT', () => {
        unmount();
        reject(new Error('SIGINT'));
      });
    } catch (err) {
      reject(err);
    }
  });
}
