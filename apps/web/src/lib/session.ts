import { createContext, use } from 'react';
import type { Session } from './api';

export interface SessionValue {
  session: Session | null;
  signIn: (session: Session) => void;
  signOut: () => void;
}

export const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = use(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}
