import { createContext, use } from 'react';
import type { Session } from './api';

export interface SessionValue {
  session: Session | null;
  /**
   * True until the boot refresh has answered. `session` is not yet meaningful
   * while it is: null means "not known", not "signed out". A screen that gates
   * on a role has to wait for this or it will refuse someone who is signed in.
   */
  restoring: boolean;
  signIn: (session: Session) => void;
  signOut: () => void;
}

export const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = use(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}
