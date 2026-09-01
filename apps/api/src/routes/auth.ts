import { Router } from 'express';
import { apiError, loginSchema, registerSchema, verifyEmailSchema } from '@kapka/shared';
import { authRateLimit } from '../middleware/rateLimit';
import { validateBody } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { getAuth } from '../auth/context';
import { redact } from '../redact';
import {
  REFRESH_COOKIE,
  clearRefreshCookieOptions,
  refreshCookieOptions,
} from '../auth/cookies';
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
  };
}

/** Everything about a user the client is allowed to see. Never the hash. */
function publicUser(user: UserRecord): SessionBody['user'] {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    // The client shows a "verify your email" prompt from this. Verification
    // gates notifications (§12), not sign-in.
    emailVerified: user.emailVerified,
  };
}

function sessionBody(user: UserRecord, accessToken: string): SessionBody {
  return {
    accessToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    user: publicUser(user),
  };
}

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
    res.status(201).json(sessionBody(user, accessToken));
  });

  router.post('/auth/login', validateBody(loginSchema), async (req, res) => {
    const { email, password } = req.body as import('@kapka/shared').LoginInput;
    const user = await repository.findUserByEmail(email);

    // One message and one status for every failure: wrong password, unknown
    // email, deactivated account. Anything more specific tells an attacker
    // which emails have accounts (§12). The dummy comparison keeps the timing
    // the same when there is no user to check against.
    const ok = user
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
    res.json(sessionBody(user, accessToken));
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
    res.json(sessionBody(user, accessToken));
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
        res.json({ user: publicUser(existing) });
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

    res.json({ user: publicUser(user) });
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
