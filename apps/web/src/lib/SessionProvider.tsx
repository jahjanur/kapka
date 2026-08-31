import { useCallback, useMemo, useState, type ReactNode } from 'react';
import type { Session } from './api';
import { SessionContext } from './session';

/**
 * Holds the signed-in user for this tab.
 *
 * In memory only, deliberately: §12 keeps the access token out of
 * localStorage, where any script on the page can read it. The refresh cookie
 * is httpOnly and survives a reload, so restoring a session across one is a
 * call to POST /auth/refresh on boot — not a copy of the token on disk. That
 * call is not wired yet, so a reload signs you out.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);

  const signIn = useCallback((next: Session) => setSession(next), []);
  const signOut = useCallback(() => setSession(null), []);

  const value = useMemo(() => ({ session, signIn, signOut }), [session, signIn, signOut]);

  return <SessionContext value={value}>{children}</SessionContext>;
}
