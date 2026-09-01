import { useCallback, useEffect, useState } from 'react';
import type {
  DonorNotification,
  ModerationQueueItem,
  PublicBloodRequest,
} from '@kapka/shared';
import { api, ApiError, type Me, type ViewedRequest } from './api';

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

  /*
   * A screen that failed while the device had no signal fixes itself when the
   * signal returns. Without this the reader is left looking at an error with
   * a button, having done nothing wrong, on a page that could load perfectly
   * well by the time they notice it.
   *
   * Only after a failure: a successful screen has no reason to refetch, and
   * doing so would put every open tab on the network at the same moment the
   * connection comes back.
   */
  const failed = current.error !== null;
  useEffect(() => {
    if (!failed) return;
    // setState in an event callback, not in the effect body.
    const retry = () => setAttempt((n) => n + 1);
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [failed]);

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

/**
 * GET /api/requests/:id — one request (§9.4).
 *
 * The token is part of the key, not just the call. Signing in changes what
 * comes back — the contact number appears — so it has to be a different fetch
 * rather than a stale hit on the anonymous one.
 */
export function useRequest(id: string, accessToken?: string): QueryResult<ViewedRequest> {
  return useQuery(`requests/${id}/${accessToken ? 'authed' : 'public'}`, () =>
    api.getRequest(id, accessToken),
  );
}

/**
 * GET /api/admin/requests — the moderation queue (§9.6).
 *
 * Goes through the same useQuery as everything else, which is what keeps the
 * fetch out of a synchronous setState inside an effect — see the note there.
 * Without a token there is nothing to ask for and no request is made.
 */
export function usePendingRequests(
  accessToken: string | undefined,
): QueryResult<ModerationQueueItem[]> {
  return useQuery(`admin/requests/${accessToken ?? 'anonymous'}`, () =>
    accessToken ? api.listPendingRequests(accessToken) : Promise.resolve([]),
  );
}

/** GET /api/me — the signed-in account and its donor profile (§9.5). */
export function useMe(accessToken: string | undefined): QueryResult<Me> {
  return useQuery(`me/${accessToken ?? 'anonymous'}`, () =>
    accessToken
      ? api.getMe(accessToken)
      : Promise.reject(new ApiError('UNAUTHENTICATED', 'Sign in to continue.', 401)),
  );
}

/** GET /api/me/notifications — what this donor has been contacted about (§9.5). */
export function useMyNotifications(
  accessToken: string | undefined,
): QueryResult<DonorNotification[]> {
  return useQuery(`me/notifications/${accessToken ?? 'anonymous'}`, () =>
    accessToken ? api.listMyNotifications(accessToken) : Promise.resolve([]),
  );
}
