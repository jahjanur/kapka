import { useCallback, useEffect, useState } from 'react';
import type { PublicBloodRequest } from '@kapka/shared';
import { SEED_REQUESTS } from './seedRequests';

interface QueryResult {
  data: PublicBloodRequest[] | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

interface QueryState {
  data?: PublicBloodRequest[];
  error: Error | null;
}

/**
 * Stands in for the TanStack Query hook that will wrap GET /api/requests.
 *
 * Deliberately shaped like the real thing — data / isLoading / error — so the
 * feed's loading, empty and error states are exercised for real now, and
 * swapping in useQuery later touches this file only.
 *
 * isLoading is derived rather than stored: setting it inside the effect would
 * mean a synchronous setState on every run, and a cascading extra render.
 */
export function useRequests(): QueryResult {
  const [state, setState] = useState<QueryState>({ error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // A short delay so the skeletons are the real first paint, the way they
    // will be against a live API on a hospital connection.
    const timer = window.setTimeout(() => {
      if (!cancelled) setState({ data: SEED_REQUESTS, error: null });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [attempt]);

  const refetch = useCallback(() => {
    setState({ error: null });
    setAttempt((n) => n + 1);
  }, []);

  return {
    data: state.data,
    isLoading: state.data === undefined && state.error === null,
    error: state.error,
    refetch,
  };
}
