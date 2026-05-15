import { useState, useEffect } from 'react';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export function useSpinner(message: string, active = true): string {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), 80);
    return () => clearInterval(id);
  }, [active]);

  return `${FRAMES[frame]} ${message}`;
}
