import { useCallback, useSyncExternalStore } from 'react';

/**
 * Whether a CSS media query currently matches.
 *
 * For the few decisions a stylesheet cannot make. Splitting a form into steps
 * is one: which fields exist changes what a "Continue" button has to validate
 * and where focus goes next, and none of that can be expressed in CSS.
 *
 * Anything that is only about how something looks stays in CSS, where it
 * belongs — reaching for this to change a colour or a gap would be a bug.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => {
        list.removeEventListener('change', onChange);
      };
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    /* Prerender, where there is no window to ask. False is the mobile-first
       answer: the narrow layout is the one that has to work everywhere. */
    () => false,
  );
}
