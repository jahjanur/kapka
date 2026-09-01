import { env } from '../env';
import { createMailer, type Mailer } from '../notify/mailer';
import { buildVerificationEmail } from '../notify/verifyEmail';
import {
  generateVerificationToken,
  hashVerificationToken,
  verificationTokenExpiry,
} from './tokens';
import type { AuthRepository, UserRecord } from './repository';

/**
 * How long a donor has to wait before asking for another link.
 *
 * The per-IP auth limiter (§12) does not cover this: the thing being protected
 * is somebody else's inbox, and a hundred requests from a hundred addresses
 * for one account is a mail bomb that every one of those limiters would wave
 * through. This one is per account.
 */
export const RESEND_COOLDOWN_SECONDS = 60;

/** Issues a confirmation link and mails it. Throws if the mail cannot go. */
export type SendVerification = (
  user: Pick<UserRecord, 'id' | 'email' | 'fullName'>,
) => Promise<void>;

/**
 * Injected into the auth routes rather than imported by them, so a test can
 * supply one that records what it was asked to send and never opens a socket.
 */
export function createVerificationSender(
  repository: AuthRepository,
  deps: { mailer?: Mailer; baseUrl?: string } = {},
): SendVerification {
  const mailer = deps.mailer ?? createMailer();
  // env strips a trailing slash, so appending a path is safe.
  const baseUrl = deps.baseUrl ?? env.APP_BASE_URL;

  return async (user) => {
    const token = generateVerificationToken();

    /* The row is written before the mail goes out. The other order would let a
       donor receive a link that the database has never heard of if the process
       dies in between — and a link that does not work is worse than no link,
       because they have no reason to ask for another one. */
    await repository.createVerificationToken(
      user.id,
      hashVerificationToken(token),
      verificationTokenExpiry(),
    );

    const link = `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`;
    await mailer.send({ ...buildVerificationEmail(user.fullName, link), to: user.email });
  };
}
