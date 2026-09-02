import type {
  ApiErrorBody,
  BloodType,
  AuthedBloodRequest,
  CreateRequestInput,
  DonorExport,
  DonorFit,
  DonorNotification,
  DonorProfilePatchInput,
  ModerationQueueItem,
  ErrorCode,
  PublicBloodRequest,
  LoginInput,
  RegisterInput,
  UserRole,
} from '@kapka/shared';
import { DONATION_INTERVAL_DAYS } from '@kapka/shared';
import { SEED_CONTACT, SEED_REQUESTS } from './seedRequests';

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
 * A request as a viewer may see it.
 *
 * contactPhone is present only for a signed-in caller: the API selects the
 * column at all only when there is a viewer (§12), so an anonymous request
 * does not get a redacted number, it gets no field.
 */
export type ViewedRequest = PublicBloodRequest & {
  contactPhone?: string;
  /**
   * Whether this donor's blood can help, answered by the API against the
   * compatibility table. Deliberately not computed here — see DonorFit.
   */
  fit?: DonorFit;
};

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

/** The donor's own profile, as §9.5's dashboard needs it. */
export interface DonorProfile {
  bloodType: BloodType;
  city: string;
  lastDonationDate: string | null;
  isAvailable: boolean;
  notifyByEmail: boolean;
  /** Null when they can give today. Computed by the API, never here (§5.2). */
  eligibleFrom: string | null;
}

export interface Me {
  user: SessionUser;
  /** Null for a requester or an admin, who never had one. */
  donorProfile: DonorProfile | null;
}

/** What approving actually did, once the emails have been attempted. */
export interface ApprovalOutcome {
  matchedDonors: number;
  sent: number;
  failed: number;
  skipped: number;
  queued: number;
  budgetExhausted: boolean;
  dailyBudgetRemaining: number;
  /** A sentence to show as-is, or null. */
  warning: string | null;
}

/** What the resend endpoint reports back. */
export interface ResendResult {
  sent: boolean;
  emailVerified: boolean;
}

export interface ApiClient {
  listRequests(): Promise<PublicBloodRequest[]>;
  /**
   * The token is optional and changes the answer: presented, the hospital's
   * contact number comes back with the request. Without it the endpoint is
   * still public — this is not authentication, it is how much of the row the
   * caller is allowed to see.
   */
  getRequest(id: string, accessToken?: string): Promise<ViewedRequest>;
  register(input: RegisterInput): Promise<Session>;
  /**
   * Signs in an existing account.
   *
   * The API answers one message for every way of failing — wrong password,
   * unknown address, deactivated account — because anything more specific
   * tells whoever is guessing which addresses have accounts (§12). The screen
   * shows exactly what it is given.
   */
  login(input: LoginInput): Promise<Session>;
  /**
   * The session this browser already has, if it has one.
   *
   * The access token lives in memory and dies with the tab (§12); the refresh
   * cookie is httpOnly and does not. This trades the cookie for a fresh
   * access token on boot, which is the only reason a reload is not a sign-out.
   *
   * `null` for "no session", never an error: arriving signed out is the
   * ordinary case, not a failure worth a message. Anything that genuinely
   * went wrong — an unreachable server — still throws.
   */
  restoreSession(): Promise<Session | null>;
  /**
   * Posts a request (§9.3). Signed in only — the API answers 401 otherwise.
   *
   * It lands as `pending`: nothing reaches a donor until an admin approves it,
   * which is why the screen says so rather than "posted".
   */
  createRequest(
    input: CreateRequestInput,
    accessToken: string,
  ): Promise<AuthedBloodRequest>;
  /** The signed-in account and its donor profile (§9.5). */
  getMe(accessToken: string): Promise<Me>;
  /** Partial by design: every field optional, at least one required. */
  updateDonorProfile(
    patch: DonorProfilePatchInput,
    accessToken: string,
  ): Promise<DonorProfile>;
  /** Everything held about the caller, for them to keep (§12). */
  exportMyData(accessToken: string): Promise<DonorExport>;
  /** Real deletion. The password again, because it cannot be undone. */
  deleteMyAccount(password: string, accessToken: string): Promise<void>;
  /** What this donor has been contacted about (§9.5). Their own rows only. */
  listMyNotifications(accessToken: string): Promise<DonorNotification[]>;
  /** The moderation queue (§9.6). Admin-only; the API answers 403 otherwise. */
  listPendingRequests(accessToken: string): Promise<ModerationQueueItem[]>;
  /** Approves and dispatches. Returns what the dispatch actually managed. */
  approveRequest(id: string, accessToken: string): Promise<ApprovalOutcome>;
  rejectRequest(id: string, reason: string, accessToken: string): Promise<void>;
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

/** Content-Type plus a bearer token, for the calls that need one. */
const authed = (accessToken: string) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${accessToken}`,
});

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
      /*
       * A dropped connection is not an HTTP status, and the two reasons it
       * drops need different answers. Someone in a hospital corridor with no
       * signal is not helped by being told the server is unreachable — their
       * move is to wait, not to retry — and the screens can only tell them
       * apart if this does.
       *
       * navigator.onLine is only trustworthy when it says false: a device on
       * a captive-portal wifi reports true and reaches nothing. So false
       * means offline, and true means we genuinely do not know, which is
       * what the server-side message says.
       */
      throw navigator.onLine
        ? new ApiError('INTERNAL', 'We could not reach the server.', 0)
        : new ApiError('OFFLINE', 'You are offline.', 0);
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
    async getRequest(id, accessToken) {
      const { request } = await call<{ request: ViewedRequest }>(
        `/requests/${encodeURIComponent(id)}`,
        accessToken
          ? {
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
              },
            }
          : undefined,
      );
      return request;
    },
    register(input) {
      return call<Session>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    login(input) {
      return call<Session>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    async restoreSession() {
      try {
        return await call<Session>('/auth/refresh', { method: 'POST' });
      } catch (error) {
        /* 401 is the answer for every way of not having a session — no
           cookie, expired, revoked, deactivated account — and none of them
           are worth interrupting someone who was only opening the feed. A
           dropped connection is a different thing and still throws. */
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    async createRequest(input, accessToken) {
      const { request } = await call<{ request: AuthedBloodRequest }>('/requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(input),
      });
      return request;
    },
    getMe(accessToken) {
      return call<Me>('/me', { headers: authed(accessToken) });
    },
    async updateDonorProfile(patch, accessToken) {
      const { donorProfile } = await call<{ donorProfile: DonorProfile }>(
        '/me/donor-profile',
        { method: 'PATCH', headers: authed(accessToken), body: JSON.stringify(patch) },
      );
      return donorProfile;
    },
    exportMyData(accessToken) {
      return call<DonorExport>('/me/export', { headers: authed(accessToken) });
    },
    async deleteMyAccount(password, accessToken) {
      await call('/me', {
        method: 'DELETE',
        headers: authed(accessToken),
        body: JSON.stringify({ password }),
      });
    },
    async listMyNotifications(accessToken) {
      const { notifications } = await call<{ notifications: DonorNotification[] }>(
        '/me/notifications',
        { headers: authed(accessToken) },
      );
      return notifications;
    },
    async listPendingRequests(accessToken) {
      const { requests } = await call<{ requests: ModerationQueueItem[] }>(
        '/admin/requests',
        { headers: authed(accessToken) },
      );
      return requests;
    },
    approveRequest(id, accessToken) {
      return call<ApprovalOutcome>(`/admin/requests/${encodeURIComponent(id)}/approve`, {
        method: 'POST',
        headers: authed(accessToken),
      });
    },
    async rejectRequest(id, reason, accessToken) {
      await call(`/admin/requests/${encodeURIComponent(id)}/reject`, {
        method: 'POST',
        headers: authed(accessToken),
        body: JSON.stringify({ reason }),
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
const DEMO_USER: SessionUser = {
  id: 'demo-user',
  email: 'demo@example.com',
  fullName: 'Demo Donor',
  role: 'donor',
  emailVerified: true,
};

const DEMO_PROFILE: DonorProfile = {
  bloodType: 'O-',
  city: 'Skopje',
  lastDonationDate: null,
  isAvailable: true,
  notifyByEmail: true,
  eligibleFrom: null,
};

/*
 * Who this tab is signed in as.
 *
 * Registering used to hand back a session in the visitor's own name and then
 * every later call answered about somebody else: you signed up as yourself
 * and your profile said Demo Donor, of Skopje, O−. A demo that contradicts
 * what it was just told teaches the reader that nothing they type matters.
 *
 * In memory, like the real session: there is no server here to hold a refresh
 * cookie, so a reload signs you out, which is at least the truth.
 */
let demoUser: SessionUser = DEMO_USER;
let demoProfile: DonorProfile = { ...DEMO_PROFILE };
/** False once somebody has registered in this tab — see listMyNotifications. */
let demoUntouched = true;

/** What the API computes in SQL (§5.2), close enough for a build with no API. */
function demoEligibleFrom(lastDonationDate: string | null): string | null {
  if (!lastDonationDate) return null;
  const eligible = new Date(`${lastDonationDate}T00:00:00`);
  eligible.setDate(eligible.getDate() + DONATION_INTERVAL_DAYS);
  return eligible > new Date() ? eligible.toISOString().slice(0, 10) : null;
}

function createDemoClient(): ApiClient {
  const latency = <T>(value: T): Promise<T> =>
    new Promise((resolve) => setTimeout(() => resolve(value), 350));

  return {
    listRequests: () => latency([...SEED_REQUESTS]),
    async getRequest(id, accessToken) {
      const found = SEED_REQUESTS.find((request) => request.id === id);
      await latency(null);
      if (!found) throw new ApiError('NOT_FOUND', 'That request does not exist.', 404);
      // Mirrors the API: the number exists only for a caller who presented a
      // token, so the signed-out screen can be walked through as it really is.
      if (!accessToken) return found;
      /* The demo donor is O−, which can help with anything — enough to walk
         the banner through locally. The real answer comes from the matrix. */
      return {
        ...found,
        contactPhone: SEED_CONTACT,
        fit: { bloodType: 'O-' as const, compatible: true, eligibleFrom: null },
      };
    },
    restoreSession() {
      /* No cookies here — the demo client never talked to a server, so it has
         no session to restore and says so immediately. Waiting on a fake
         round trip would only put a spinner in front of the seed data. */
      return Promise.resolve(null);
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
      demoUser = {
        id: 'demo-user',
        email: input.email,
        fullName: input.fullName,
        role: 'donor',
        emailVerified: false,
      };
      demoProfile = {
        bloodType: input.bloodType,
        city: input.city,
        lastDonationDate: input.lastDonationDate ?? null,
        isAvailable: true,
        notifyByEmail: true,
        eligibleFrom: demoEligibleFrom(input.lastDonationDate ?? null),
      };
      demoUntouched = false;

      return { user: demoUser, accessToken: 'demo-access-token' };
    },
    async login(input) {
      await latency(null);
      /* One rehearsable failure, as with register: the wrong password, which
         is the only one worth walking through locally. Everything else signs
         in as whoever this tab last registered — there is no password store
         here to check against. */
      if (input.password === 'wrong') {
        throw new ApiError(
          'INVALID_CREDENTIALS',
          'That email and password do not match.',
          401,
        );
      }
      demoUser = { ...demoUser, email: input.email };
      return { user: demoUser, accessToken: 'demo-access-token' };
    },
    async createRequest(input) {
      await latency(null);
      const now = new Date();
      const week = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      /* Written out rather than spread from the input: the schema's optional
         fields are `number | null | undefined` and the response type's are
         `number | null`, which exactOptionalPropertyTypes is right to keep
         apart. Absent and null are not the same answer. */
      return {
        id: 'demo-request',
        bloodType: input.bloodType,
        unitsNeeded: input.unitsNeeded,
        urgency: input.urgency,
        hospitalName: input.hospitalName,
        hospitalLat: input.hospitalLat ?? null,
        hospitalLng: input.hospitalLng ?? null,
        city: input.city,
        contactPhone: input.contactPhone,
        note: input.note ?? null,
        // Pending, like the real one. A demo that answered 'approved' would
        // rehearse a flow the product does not have.
        status: 'pending' as const,
        createdAt: now.toISOString(),
        expiresAt: week.toISOString(),
      };
    },
    async getMe() {
      await latency(null);
      return { user: demoUser, donorProfile: { ...demoProfile } };
    },
    async updateDonorProfile(patch) {
      await latency(null);
      // Kept in a module-level object so the dashboard's own edits stick for
      // as long as the tab is open, the way the real one would.
      /* Field by field, not a spread: under exactOptionalPropertyTypes an
         absent key and an undefined one are different, and spreading the
         patch would write undefined over a value that is meant to stay. */
      demoProfile = {
        ...demoProfile,
        ...(patch.bloodType === undefined ? {} : { bloodType: patch.bloodType }),
        ...(patch.city === undefined ? {} : { city: patch.city }),
        ...('lastDonationDate' in patch
          ? { lastDonationDate: patch.lastDonationDate ?? null }
          : {}),
        ...(patch.isAvailable === undefined ? {} : { isAvailable: patch.isAvailable }),
        ...(patch.notifyByEmail === undefined
          ? {}
          : { notifyByEmail: patch.notifyByEmail }),
      };
      return { ...demoProfile };
    },
    async exportMyData() {
      await latency(null);
      return {
        exportedAt: new Date().toISOString(),
        account: {
          id: demoUser.id,
          email: demoUser.email,
          fullName: demoUser.fullName,
          phone: null,
          role: demoUser.role,
          emailVerified: demoUser.emailVerified,
          createdAt: new Date().toISOString(),
        },
        donorProfile: { ...demoProfile },
        requests: [],
        notifications: [],
      };
    },
    async deleteMyAccount() {
      await latency(null);
    },
    async listMyNotifications() {
      await latency(null);
      /* Two canned rows so both states are visible locally — but only for the
         stock demo account. Somebody who has just registered in this tab has
         been emailed about nothing, and showing them otherwise would be the
         same lie as the profile in somebody else's name. */
      if (!demoUntouched) return [];
      const [first, second] = SEED_REQUESTS;
      if (!first || !second) return [];
      return [
        {
          requestId: first.id,
          bloodType: first.bloodType,
          urgency: first.urgency,
          hospitalName: first.hospitalName,
          city: first.city,
          requestStatus: 'approved' as const,
          status: 'sent' as const,
          createdAt: first.createdAt,
          sentAt: first.createdAt,
        },
        {
          requestId: second.id,
          bloodType: second.bloodType,
          urgency: second.urgency,
          hospitalName: second.hospitalName,
          city: second.city,
          // Fulfilled and queued, so both of the cases worth seeing are on
          // screen locally without contriving them.
          requestStatus: 'fulfilled' as const,
          status: 'queued' as const,
          createdAt: second.createdAt,
          sentAt: null,
        },
      ];
    },
    async listPendingRequests() {
      await latency(null);
      return SEED_REQUESTS.slice(0, 3).map((request, index) => ({
        ...request,
        status: 'pending' as const,
        contactPhone: SEED_CONTACT,
        requesterName:
          ['Ana Petrovska', 'Bojan Ristov', 'Marija Ilieva'][index] ?? 'Someone',
        matchedDonors: [23, 4, 0][index] ?? 0,
      }));
    },
    async approveRequest() {
      await latency(null);
      return {
        matchedDonors: 23,
        sent: 23,
        failed: 0,
        skipped: 0,
        queued: 0,
        budgetExhausted: false,
        dailyBudgetRemaining: 77,
        warning: null,
      };
    },
    async rejectRequest() {
      await latency(null);
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
      demoUser = { ...demoUser, emailVerified: true };
      return demoUser;
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
