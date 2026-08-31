import { useEffect, useState } from 'react';
import { SEED_REQUESTS, type BloodRequest } from './requests';

interface QueryResult {
  data: BloodRequest[] | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Stands in for the TanStack Query hook that will wrap GET /api/requests.
 *
 * Deliberately shaped like the real thing — data / isLoading / error — so the
 * feed's loading, empty and error states are exercised for real now, and
 * swapping in useQuery later touches this file only.
 */
export function useRequests(): QueryResult {
  const [data, setData] = useState<BloodRequest[] | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    // A short delay so the skeletons are the real first paint, the way they
    // will be against a live API on a hospital connection.
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setData(SEED_REQUESTS);
      setIsLoading(false);
    }, 350);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [attempt]);

  return { data, isLoading, error, refetch: () => setAttempt((n) => n + 1) };
}
