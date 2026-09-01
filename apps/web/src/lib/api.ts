import type {
  ApiErrorBody,
  ErrorCode,
  PublicBloodRequest,
  RegisterInput,
  UserRole,
} from '@kapka/shared';
import { SEED_REQUESTS } from './seedRequests';

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  emailVerified: boolean;
}

export interface Session {
  user: SessionUser;
  accessToken: string;
}

/**
 * A failed call, carrying the API's own error envelope (§4).
 *
 * `field` is what lets a form put the message next to the input it belongs to
 * rather than in a banner at the top — "That email is already registered"
 * belongs on the email field.
 */
export class ApiError extends Error {
  readonly code: ErrorCode;
  /** exactOptionalPropertyTypes is on, so absent and undefined differ. */
  readonly field: string | undefined;
  readonly status: number;

  constructor(code: ErrorCode, message: string, status: number, field?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.field = field;
    this.status = status;
  }
}

/** What the resend endpoint reports back. */
export interface ResendResult {
  sent: boolean;
  emailVerified: boolean;
}

export interface ApiClient {
  listRequests(): Promise<PublicBloodRequest[]>;
  getRequest(id: string): Promise<PublicBloodRequest>;
  register(input: RegisterInput): Promise<Session>;
  /** Spends the token from a confirmation link. Returns the confirmed user. */
  verifyEmail(token: string): Promise<SessionUser>;
  /**
   * Asks for another confirmation link.
   *
   * Takes the access token explicitly rather than reading a module-level
   * session: the endpoint is authenticated, and the alternative is a hidden
   * dependency between this file and whichever provider happens to be mounted.
   */
  resendVerification(accessToken: string): Promise<ResendResult>;
}

/* ── The real one ───────────────────────────────────────────────────────── */

function isErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as ApiErrorBody).error === 'object'
  );
}

function createHttpClient(baseUrl: string): ApiClient {
  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        // The refresh token rides in an httpOnly cookie (§12), so every call
        // has to carry credentials or a session never survives a reload.
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        ...init,
      });
    } catch {
      // A dropped connection is not an HTTP status, and the screens still
      // need something they can show a person.
      throw new ApiError('INTERNAL', 'We could not reach the server.', 0);
    }

    if (response.status === 204) return undefined as T;

    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      if (isErrorBody(body)) {
        throw new ApiError(
          body.error.code,
          body.error.message,
          response.status,
          body.error.field,
        );
      }
      throw new ApiError('INTERNAL', 'Something went wrong.', response.status);
    }
    return body as T;
  }

  return {
    async listRequests() {
      const { requests } = await call<{ requests: PublicBloodRequest[] }>('/requests');
      return requests;
    },
    async getRequest(id) {
      const { request } = await call<{ request: PublicBloodRequest }>(
        `/requests/${encodeURIComponent(id)}`,
      );
      return request;
    },
    register(input) {
      return call<Session>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    async verifyEmail(token) {
      const { user } = await call<{ user: SessionUser }>('/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
      return user;
    },
    resendVerification(accessToken) {
      return call<ResendResult>('/auth/verify-email/resend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });
    },
  };
}

/* ── The development stand-in ───────────────────────────────────────────── */

/**
 * Serves the seed data so the whole app is walkable with nothing else running.
 *
 * This exists because `npm run dev` starts the web app alone. Without it every
 * screen is an error state on a fresh clone, which is a bad way to find out
 * what the product looks like.
 *
 * It is reachable ONLY in a dev build with no VITE_API_URL set — see
 * createApiClient. A production build always talks to a real API.
 */
function createDemoClient(): ApiClient {
  const latency = <T>(value: T): Promise<T> =>
    new Promise((resolve) => setTimeout(() => resolve(value), 350));

  return {
    listRequests: () => latency([...SEED_REQUESTS]),
    async getRequest(id) {
      const found = SEED_REQUESTS.find((request) => request.id === id);
      await latency(null);
      if (!found) throw new ApiError('NOT_FOUND', 'That request does not exist.', 404);
      return found;
    },
    async register(input) {
      await latency(null);
      // The one failure worth rehearsing: it is the only one with a field.
      if (input.email === 'taken@example.com') {
        throw new ApiError(
          'EMAIL_TAKEN',
          'That email is already registered.',
          409,
          'email',
        );
      }
      return {
        user: {
          id: 'demo-user',
          email: input.email,
          fullName: input.fullName,
          role: 'donor',
          emailVerified: false,
        },
        accessToken: 'demo-access-token',
      };
    },
    async verifyEmail(token) {
      await latency(null);
      // 'expired' is the failure worth being able to walk through locally: it
      // is the only one a real donor is likely to hit.
      if (token === 'expired') {
        throw new ApiError(
          'VALIDATION_FAILED',
          'That confirmation link has expired. Ask for a new one.',
          400,
          'token',
        );
      }
      return {
        id: 'demo-user',
        email: 'demo@example.com',
        fullName: 'Demo Donor',
        role: 'donor',
        emailVerified: true,
      };
    },
    async resendVerification() {
      await latency(null);
      return { sent: true, emailVerified: false };
    },
  };
}

/**
 * Which client this build gets.
 *
 * VITE_API_URL wins. Failing that a production build uses the same origin,
 * because the API and the web app are served together. Only a dev build with
 * neither falls back to the seed data.
 */
export function createApiClient(): ApiClient {
  const configured = import.meta.env.VITE_API_URL as string | undefined;
  if (configured) return createHttpClient(configured.replace(/\/$/, ''));
  if (import.meta.env.PROD) return createHttpClient('/api');
  return createDemoClient();
}

export const api: ApiClient = createApiClient();

/** True when the screens are showing invented data. Dev builds only. */
export const IS_DEMO_DATA =
  !import.meta.env.PROD && !(import.meta.env.VITE_API_URL as string | undefined);
