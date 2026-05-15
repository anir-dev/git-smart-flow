import { useState, useEffect } from 'react';

/**
 * Returns true after delayMs, false until then.
 * Apply as `isDisabled={!isActive}` on any @inkjs/ui interactive component
 * to prevent ghost key events from a previous Ink render from triggering
 * actions immediately after mounting.
 */
export function useActivation(delayMs = 120): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setActive(true), delayMs);
    return () => clearTimeout(t);
  }, []);
  return active;
}
