import { Router, type Response } from 'express';
import { apiError, loginSchema, registerSchema, verifyEmailSchema } from '@kapka/shared';
import { authRateLimit } from '../middleware/rateLimit';
import { validateBody } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { getAuth } from '../auth/context';
import { redact } from '../redact';
import {
  OAUTH_STATE_COOKIE,
  REFRESH_COOKIE,
  clearOauthStateCookieOptions,
  clearRefreshCookieOptions,
  oauthStateCookieOptions,
  refreshCookieOptions,
} from '../auth/cookies';
import {
  authorizationUrl,
  beginHandshake,
  exchangeCode,
  statesMatch,
  type GoogleIdentity,
} from '../auth/google';
import { env } from '../env';
import { hashPassword, verifyAgainstNobody, verifyPassword } from '../auth/passwords';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  generateRefreshToken,
  hashRefreshToken,
  hashVerificationToken,
  refreshTokenExpiry,
  signAccessToken,
} from '../auth/tokens';
import {
  createVerificationSender,
  RESEND_COOLDOWN_SECONDS,
  type SendVerification,
} from '../auth/verification';
import type { AuthRepository, UserRecord } from '../auth/repository';

interface SessionBody {
  accessToken: string;
  expiresIn: number;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: UserRecord['role'];
    emailVerified: boolean;
    /**
     * Whether this account has a donor profile — which is NOT the same
     * question as `role === 'donor'`.
     *
     * A Google sign-in creates a user with that role and no profile, because
     * Google knows neither blood type nor city and both are NOT NULL. Such an
     * account is invisible to the matching query, so a screen that reads the
     * role to decide whether somebody is a donor tells them they will be
     * emailed when they never will be.
     *
     * It travels with the session so the first paint is already right: the
     * alternative is every screen fetching /api/me and showing the wrong
     * thing until it answers.
     */
    hasDonorProfile: boolean;
  };
}

/** Everything about a user the client is allowed to see. Never the hash. */
function publicUser(user: UserRecord, hasDonorProfile: boolean): SessionBody['user'] {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    // The client shows a "verify your email" prompt from this. Verification
    // gates notifications (§12), not sign-in.
    emailVerified: user.emailVerified,
    hasDonorProfile,
  };
}

/* A parameter rather than a lookup inside: registration knows the answer
   without asking (it just wrote the row), and the sites that do not know are
   made to say so at the call. */
function sessionBody(
  user: UserRecord,
  accessToken: string,
  hasDonorProfile: boolean,
): SessionBody {
  return {
    accessToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    user: publicUser(user, hasDonorProfile),
  };
}

/** Where the browser is sent when the handshake finishes, either way. */
const OAUTH_LANDING = '/auth/callback';

/**
 * `sendVerification` is injectable for the same reason the repository is: the
 * registration endpoint can then be exercised over real HTTP without a mail
 * server, and a test can read the token it issued.
 */
export function createAuthRouter(
  repository: AuthRepository,
  sendVerification: SendVerification = createVerificationSender(repository),
): Router {
  const router = Router();
  router.use(authRateLimit);

  /**
   * Sends the confirmation link, and swallows a failure to send it.
   *
   * A provider outage must not fail a registration. The account exists, the
   * password is right, the donor profile is saved — the only thing missing is
   * a link they can ask for again. Failing the whole request would throw all
   * of that away and tell them to start over, which is both wrong and the
   * kind of thing that loses a donor for good.
   *
   * Redacted, because a provider error quotes the recipient address (§12).
   */
  async function sendVerificationQuietly(user: UserRecord): Promise<boolean> {
    try {
      await sendVerification(user);
      return true;
    } catch (error) {
      console.error(`[auth] could not send a confirmation email: ${redact(error)}`);
      return false;
    }
  }

  /** Issues a refresh token, stores its hash, and sets the cookie. */
  async function startSession(
    userId: string,
    setCookie: (
      name: string,
      value: string,
      options: ReturnType<typeof refreshCookieOptions>,
    ) => void,
  ): Promise<void> {
    const token = generateRefreshToken();
    await repository.storeRefreshToken(
      userId,
      hashRefreshToken(token),
      refreshTokenExpiry(),
    );
    setCookie(REFRESH_COOKIE, token, refreshCookieOptions());
  }

  /**
   * GET /api/auth/providers — which third-party sign-ins are on offer.
   *
   * The web app asks once and renders the buttons it is told about. A button
   * for a provider whose credentials are not configured would redirect to a
   * failure, and a control that cannot do its job is worse than no control.
   */
  router.get('/auth/providers', (_req, res) => {
    res.json({ providers: env.googleEnabled ? ['google'] : [] });
  });

  /**
   * The account this Google identity signs into: the one already linked to
   * the subject, the one holding the same verified address, or a new one.
   *
   * Null means the sign-in must be refused — see the linking rule below.
   */
  async function resolveGoogleUser(identity: GoogleIdentity): Promise<UserRecord | null> {
    const linked = await repository.findUserByIdentity('google', identity.subject);
    if (linked) return linked;

    const existing = await repository.findUserByEmail(identity.email);
    if (existing) {
      /*
       * The linking rule, and the one decision in this file worth arguing
       * about.
       *
       * Attaching a provider identity to an account that already has the
       * same email is how somebody signs in on Monday with a password and on
       * Tuesday with Google and gets the same account, which is what anybody
       * would expect. It is also, if the address is not verified at Google,
       * how somebody takes over an account they do not own: create a Google
       * account claiming ana@example.com, never prove you read that mailbox,
       * sign in here, and be Ana.
       *
       * Google's own verification is the only evidence available at this
       * point, so an unverified address linking to an existing account is
       * refused outright (§12). A new account is a different matter — there
       * is nothing to take over — and gets made below with email_verified
       * carrying whatever Google actually said.
       */
      if (!identity.emailVerified) return null;
      await repository.linkIdentity(existing.id, 'google', identity.subject);
      return existing;
    }

    return repository.createUserFromIdentity({
      email: identity.email,
      fullName: identity.fullName,
      emailVerified: identity.emailVerified,
      provider: 'google',
      subject: identity.subject,
    });
  }

  /** Everything that can go wrong ends up back on the gate, saying so. */
  function failToApp(res: Response, reason: string): void {
    res.clearCookie(OAUTH_STATE_COOKIE, clearOauthStateCookieOptions());
    res.redirect(`${env.APP_BASE_URL}${OAUTH_LANDING}?error=${reason}`);
  }

  /**
   * GET /api/auth/google — the start of the handshake (§9.2).
   *
   * A 302 the API issues, not a link the page opens, and not Google's in-page
   * SDK: the web app's CSP is `connect-src 'self'` with a script-src hash
   * pin, and a redirect from here is not governed by the document's policy at
   * all. See auth/google.ts.
   */
  router.get('/auth/google', (_req, res) => {
    if (!env.googleEnabled) {
      res.status(404).json(apiError('NOT_FOUND', 'Google sign-in is not configured.'));
      return;
    }

    const handshake = beginHandshake();
    /* state and the PKCE verifier travel in a Lax cookie, because the trip
       back from Google is a cross-site navigation and the Strict refresh
       cookie would not be sent on it. */
    res.cookie(OAUTH_STATE_COOKIE, JSON.stringify(handshake), oauthStateCookieOptions());
    res.redirect(authorizationUrl(handshake));
  });

  /**
   * GET /api/auth/google/callback — the other end of it.
   *
   * Ends in a redirect either way rather than a JSON body: the browser
   * arrives here by navigation, so what it can be given is a page, and the
   * page it should be given is the app.
   */
  router.get('/auth/google/callback', async (req, res) => {
    if (!env.googleEnabled) {
      res.status(404).json(apiError('NOT_FOUND', 'Google sign-in is not configured.'));
      return;
    }

    const query = req.query as Record<string, string | undefined>;
    /* The person pressed cancel on Google's screen. Not an error to log — it
       is a decision, and the only thing owed to them is the way back. */
    if (typeof query.error === 'string') {
      failToApp(res, 'cancelled');
      return;
    }

    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    const raw = cookies?.[OAUTH_STATE_COOKIE];
    const code = query.code;
    const state = query.state;

    if (
      typeof raw !== 'string' ||
      typeof code !== 'string' ||
      typeof state !== 'string'
    ) {
      // No cookie usually means the ten minutes ran out, or a bare callback
      // URL was opened by hand.
      failToApp(res, 'expired');
      return;
    }

    let handshake: { state?: unknown; codeVerifier?: unknown };
    try {
      handshake = JSON.parse(raw) as typeof handshake;
    } catch {
      failToApp(res, 'expired');
      return;
    }

    if (
      typeof handshake.state !== 'string' ||
      typeof handshake.codeVerifier !== 'string' ||
      !statesMatch(handshake.state, state)
    ) {
      /* The CSRF check. A callback whose state does not match the one this
         browser started with is somebody else's — most likely an attacker
         feeding their own authorization code to a logged-in victim, which
         would otherwise link the victim's browser to the attacker's Google
         account (§12). */
      failToApp(res, 'state');
      return;
    }

    let identity;
    try {
      identity = await exchangeCode(code, handshake.codeVerifier);
    } catch (error) {
      /* Redacted: the token endpoint quotes the request back, client_secret
         and all, and this is the one error whose body must never be logged
         verbatim. */
      console.error(`[auth] google sign-in failed: ${redact(error)}`);
      failToApp(res, 'provider');
      return;
    }

    const user = await resolveGoogleUser(identity);
    if (!user) {
      failToApp(res, 'unverified');
      return;
    }
    if (!user.isActive) {
      failToApp(res, 'inactive');
      return;
    }

    res.clearCookie(OAUTH_STATE_COOKIE, clearOauthStateCookieOptions());
    await startSession(user.id, (name, value, options) =>
      res.cookie(name, value, options),
    );
    /* No access token in the URL. The refresh cookie is set, and the app
       trades it for one on boot the same way it does after a reload — a token
       in a query string ends up in history, in logs and in the Referer of
       everything the next page loads (§12). */
    res.redirect(`${env.APP_BASE_URL}${OAUTH_LANDING}`);
  });

  /* Asked once per session-issuing response. Cheap — a primary-key lookup —
     and the alternative is a boolean that drifts from the row it describes. */
  const hasProfile = async (userId: string) =>
    (await repository.findDonorProfile(userId)) !== null;

  router.post('/auth/register', validateBody(registerSchema), async (req, res) => {
    const input = req.body as import('@kapka/shared').RegisterInput;

    const existing = await repository.findUserByEmail(input.email);
    if (existing) {
      // Registration cannot hide that an email is taken — the user has to be
      // told. Login is where enumeration matters, and it says nothing.
      res
        .status(409)
        .json(apiError('EMAIL_TAKEN', 'That email already has an account.', 'email'));
      return;
    }

    const user = await repository.createUser({
      fullName: input.fullName,
      email: input.email,
      passwordHash: await hashPassword(input.password),
      phone: input.phone ?? null,
      bloodType: input.bloodType,
      city: input.city,
      lastDonationDate: input.lastDonationDate ?? null,
    });

    /* Before the response, so a donor who is still looking at the tab has the
       mail on its way rather than queued behind whatever this process does
       next. It cannot fail the registration — see sendVerificationQuietly. */
    await sendVerificationQuietly(user);

    const accessToken = await signAccessToken(user.id, user.role);
    await startSession(user.id, (name, value, options) =>
      res.cookie(name, value, options),
    );
    /* True without asking: createUser writes the user and the profile in one
       transaction, so if there is a user here there is a profile. */
    res.status(201).json(sessionBody(user, accessToken, true));
  });

  router.post('/auth/login', validateBody(loginSchema), async (req, res) => {
    const { email, password } = req.body as import('@kapka/shared').LoginInput;
    const user = await repository.findUserByEmail(email);

    // One message and one status for every failure: wrong password, unknown
    // email, deactivated account. Anything more specific tells an attacker
    // which emails have accounts (§12). The dummy comparison keeps the timing
    // the same when there is no user to check against.
    /* A null hash is an account that has only ever signed in with a
       provider. It has no password, so no password can be right — but it
       still has to cost what a real check costs, or the timing says "this
       address exists and uses Google", which is exactly the kind of thing
       this endpoint refuses to say (§12). */
    const ok =
      user && user.passwordHash !== null
        ? await verifyPassword(password, user.passwordHash)
        : await verifyAgainstNobody(password);

    if (!user || !ok || !user.isActive) {
      res
        .status(401)
        .json(apiError('INVALID_CREDENTIALS', 'That email and password do not match.'));
      return;
    }

    const accessToken = await signAccessToken(user.id, user.role);
    await startSession(user.id, (name, value, options) =>
      res.cookie(name, value, options),
    );
    res.json(sessionBody(user, accessToken, await hasProfile(user.id)));
  });

  router.post('/auth/refresh', async (req, res) => {
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    const presented = cookies?.[REFRESH_COOKIE];
    if (!presented) {
      res.status(401).json(apiError('UNAUTHENTICATED', 'No session.'));
      return;
    }

    const record = await repository.findRefreshToken(hashRefreshToken(presented));
    if (!record) {
      res.clearCookie(REFRESH_COOKIE, clearRefreshCookieOptions());
      res.status(401).json(apiError('UNAUTHENTICATED', 'No session.'));
      return;
    }

    if (record.revokedAt) {
      /*
       * A revoked token was presented. The legitimate holder rotated it, so
       * whoever sent this one either copied it or is replaying an old one —
       * either way the session is not trustworthy. Revoke the whole family
       * and make everyone sign in again.
       */
      await repository.revokeAllForUser(record.userId);
      res.clearCookie(REFRESH_COOKIE, clearRefreshCookieOptions());
      res
        .status(401)
        .json(apiError('UNAUTHENTICATED', 'Session ended. Please sign in again.'));
      return;
    }

    if (record.expiresAt.getTime() <= Date.now()) {
      await repository.revokeRefreshToken(record.id);
      res.clearCookie(REFRESH_COOKIE, clearRefreshCookieOptions());
      res
        .status(401)
        .json(apiError('UNAUTHENTICATED', 'Session expired. Please sign in again.'));
      return;
    }

    const user = await repository.findUserById(record.userId);
    if (!user?.isActive) {
      await repository.revokeAllForUser(record.userId);
      res.clearCookie(REFRESH_COOKIE, clearRefreshCookieOptions());
      res.status(401).json(apiError('UNAUTHENTICATED', 'No session.'));
      return;
    }

    // Rotation: the presented token stops working the moment this succeeds.
    const next = generateRefreshToken();
    await repository.rotateRefreshToken(
      record.id,
      user.id,
      hashRefreshToken(next),
      refreshTokenExpiry(),
    );
    res.cookie(REFRESH_COOKIE, next, refreshCookieOptions());

    const accessToken = await signAccessToken(user.id, user.role);
    /* The refresh path is how a Google sign-in becomes a session, and it is
       the one that most needs the real answer rather than the role. */
    res.json(sessionBody(user, accessToken, await hasProfile(user.id)));
  });

  router.post('/auth/logout', async (req, res) => {
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    const presented = cookies?.[REFRESH_COOKIE];

    if (presented) {
      const record = await repository.findRefreshToken(hashRefreshToken(presented));
      if (record && !record.revokedAt) await repository.revokeRefreshToken(record.id);
    }

    // Always clear and always succeed. Logging out must not be able to fail,
    // and must not report whether there was a session to end.
    res.clearCookie(REFRESH_COOKIE, clearRefreshCookieOptions());
    res.status(204).end();
  });

  /*
   * The two halves of §12's "donors only enter the notification pool after
   * verifying their email". The matching query already refuses an unverified
   * donor; these are what let one stop being unverified.
   */

  router.post('/auth/verify-email', validateBody(verifyEmailSchema), async (req, res) => {
    const { token } = req.body as import('@kapka/shared').VerifyEmailInput;
    const record = await repository.findVerificationToken(hashVerificationToken(token));

    const invalid = () => {
      res
        .status(400)
        .json(
          apiError(
            'VALIDATION_FAILED',
            'That confirmation link is not valid. Ask for a new one.',
            'token',
          ),
        );
    };

    if (!record) {
      invalid();
      return;
    }

    /* A link that cannot be spent is not automatically a failure. Whoever
       holds this token had to be reading the mailbox it went to, so if the
       address is confirmed, saying so reveals nothing they could not already
       see — and "that link is not valid" for an account that IS verified is a
       small panic for no reason. */
    const answerSpent = async () => {
      const existing = await repository.findUserById(record.userId);
      if (existing?.emailVerified) {
        res.json({ user: publicUser(existing, await hasProfile(existing.id)) });
        return;
      }
      invalid();
    };

    // A second tap on the same link, usually.
    if (record.consumedAt) {
      await answerSpent();
      return;
    }

    if (record.expiresAt.getTime() <= Date.now()) {
      // Said separately from "not valid": the fix is different. This one is
      // "ask for another", not "check the link you pasted".
      res
        .status(400)
        .json(
          apiError(
            'VALIDATION_FAILED',
            'That confirmation link has expired. Ask for a new one.',
            'token',
          ),
        );
      return;
    }

    const user = await repository.consumeVerificationToken(record.id, record.userId);
    if (!user) {
      // Two taps arriving together, and the other one won. Nothing is wrong,
      // and the donor should see the same thing either way.
      await answerSpent();
      return;
    }

    res.json({ user: publicUser(user, await hasProfile(user.id)) });
  });

  router.post('/auth/verify-email/resend', requireAuth(repository), async (_req, res) => {
    const auth = getAuth(res);
    if (!auth) return; // requireAuth has already answered.

    const user = await repository.findUserById(auth.userId);
    if (!user) return;

    /* Authenticated rather than taking an email address in the body. An
       endpoint that mails whichever address it is handed is both an account
       enumerator and a way to send Kapka-branded mail to strangers. Everyone
       who needs this is signed in: registration returns a session, and login
       works whether or not the address is confirmed. */
    if (user.emailVerified) {
      res.json({ sent: false, emailVerified: true });
      return;
    }

    const lastSent = await repository.lastVerificationSentAt(user.id);
    const cooldownMs = RESEND_COOLDOWN_SECONDS * 1000;
    if (lastSent && Date.now() - lastSent.getTime() < cooldownMs) {
      res
        .status(429)
        .json(
          apiError(
            'RATE_LIMITED',
            'We just sent one. Check your inbox, then try again in a minute.',
          ),
        );
      return;
    }

    const sent = await sendVerificationQuietly(user);
    if (!sent) {
      // Unlike registration, there is nothing else this request achieved, so
      // saying it worked would leave someone waiting for mail that never went.
      res
        .status(502)
        .json(apiError('INTERNAL', 'We could not send that email. Try again shortly.'));
      return;
    }

    res.json({ sent: true, emailVerified: false });
  });

  return router;
}
