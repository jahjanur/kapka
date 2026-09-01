import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type Session } from './api';
import { SessionContext } from './session';

/**
 * Holds the signed-in user for this tab.
 *
 * In memory only, deliberately: §12 keeps the access token out of
 * localStorage, where any script on the page can read it. The refresh cookie
 * is httpOnly and survives a reload, so restoring a session across one is a
 * call to POST /auth/refresh on boot — and that call is what this does.
 *
 * Until it answers, the app does not yet know who it is talking to. That is
 * what `restoring` is for: a screen that reads the session on the first
 * render would otherwise decide the visitor is signed out and say so, and
 * then correct itself a moment later. Telling somebody they are not an
 * administrator and then showing them the queue is worse than a brief wait.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    /* An AbortController rather than a `let cancelled = false`, which reads
       more plainly but which type-aware lint cannot see through: nothing in
       the effect body assigns it, so the check always looks redundant. */
    const gone = new AbortController();
    void (async () => {
      try {
        const restored = await api.restoreSession();
        // StrictMode mounts twice, and a slow first call must not overwrite a
        // sign-in that happened while it was in flight.
        if (!gone.signal.aborted && restored) setSession(restored);
      } catch {
        /* An unreachable server is not a reason to block the app: the feed is
           public and reads perfectly well signed out. Whatever the visitor
           does next will surface the real error in the place it belongs. */
      } finally {
        if (!gone.signal.aborted) setRestoring(false);
      }
    })();
    return () => {
      gone.abort();
    };
  }, []);

  const signIn = useCallback((next: Session) => setSession(next), []);
  const signOut = useCallback(() => setSession(null), []);

  const value = useMemo(
    () => ({ session, restoring, signIn, signOut }),
    [session, restoring, signIn, signOut],
  );

  return <SessionContext value={value}>{children}</SessionContext>;
}
