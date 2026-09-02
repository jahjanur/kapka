import { useEffect, useRef, useState } from 'react';

/**
 * Counts from zero to `value` once, when the value first arrives.
 *
 * The stat strip is the one place on the feed that says how much is happening
 * right now, and a number that lands already-finished says it much more
 * quietly than one the reader watches arrive.
 *
 * Two rules it keeps:
 *
 *   nobody is made to wait for information — the count takes well under a
 *   second and the final value is on screen either way;
 *
 *   prefers-reduced-motion is honoured here in JavaScript rather than left to
 *   the stylesheet, because this is a changing number rather than a moving
 *   box, and CSS cannot stop it.
 */
export function useCountUp(value: number, duration = 700): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    const stillOk =
      typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function';
    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!stillOk || reduced || value === from.current) {
      from.current = value;
      setShown(value);
      return;
    }

    const start = performance.now();
    const begin = from.current;
    from.current = value;
    let frame = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // Ease out: fast at the start, settling rather than stopping.
      const eased = 1 - (1 - t) ** 3;
      setShown(Math.round(begin + (value - begin) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [value, duration]);

  return shown;
}
