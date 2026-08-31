import { useCallback, useEffect, useState } from 'react';
import type { PublicBloodRequest } from '@kapka/shared';
import { api, ApiError } from './api';

interface Snapshot<T> {
  /** Which fetch this data belongs to. */
  key: string;
  data?: T;
  error: ApiError | null;
}

export interface QueryResult<T> {
  data: T | undefined;
  isLoading: boolean;
  error: ApiError | null;
  refetch: () => void;
}

/**
 * The one fetching pattern both screens use.
 *
 * Shaped like TanStack Query's useQuery — data / isLoading / error / refetch —
 * so swapping it for the real thing later is an import change rather than a
 * rewrite of every caller.
 *
 * isLoading is derived rather than stored: setting it inside the effect would
 * mean a synchronous setState on every run, and a cascading extra render.
 */
function useQuery<T>(key: string, fetcher: () => Promise<T>): QueryResult<T> {
  const [state, setState] = useState<Snapshot<T>>({ key, error: null });
  const [attempt, setAttempt] = useState(0);

  /*
   * The snapshot carries the key it belongs to, and a mismatch is read as
   * loading during render.
   *
   * The obvious alternative — clearing the state at the top of the effect —
   * is a synchronous setState inside an effect, which costs a second render
   * pass on every fetch and is what react-hooks/set-state-in-effect is there
   * to catch. This way navigating from one request to another shows the
   * skeleton immediately instead of the previous request's data.
   */
  const current: Snapshot<T> = state.key === key ? state : { key, error: null };

  useEffect(() => {
    let cancelled = false;

    fetcher()
      .then((data) => {
        if (!cancelled) setState({ key, data, error: null });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          key,
          error:
            error instanceof ApiError
              ? error
              : new ApiError('INTERNAL', 'Something went wrong.', 0, undefined),
        });
      });

    return () => {
      cancelled = true;
    };
    // The key identifies what is being fetched; the fetcher closure is
    // recreated every render and would loop if it were the dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const refetch = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);

  return {
    data: current.data,
    isLoading: current.data === undefined && current.error === null,
    error: current.error,
    refetch,
  };
}

/** GET /api/requests — the public feed (§9.1). */
export function useRequests(): QueryResult<PublicBloodRequest[]> {
  return useQuery('requests', () => api.listRequests());
}

/** GET /api/requests/:id — one request (§9.4). */
export function useRequest(id: string): QueryResult<PublicBloodRequest> {
  return useQuery(`requests/${id}`, () => api.getRequest(id));
}
