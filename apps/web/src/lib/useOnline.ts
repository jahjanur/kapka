import { useCallback, useSyncExternalStore } from 'react';

/**
 * Whether the device thinks it has a connection.
 *
 * Only trustworthy when it says false. A phone on a captive-portal wifi — a
 * hospital's guest network before you have accepted its terms — reports
 * online and reaches nothing. So this is used to explain a failure that has
 * already happened, never to predict one: nothing is prevented from trying.
 */
export function useOnline(): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    window.addEventListener('online', onChange);
    window.addEventListener('offline', onChange);
    return () => {
      window.removeEventListener('online', onChange);
      window.removeEventListener('offline', onChange);
    };
  }, []);

  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    // Prerender, where there is no navigator. Assume a connection: the
    // pessimistic answer would render an offline banner into the HTML.
    () => true,
  );
}
