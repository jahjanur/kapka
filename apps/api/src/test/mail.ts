import type { SendVerification } from '../auth/verification';

/**
 * A confirmation sender that does nothing, for the tests that are not about
 * confirmation.
 *
 * Registering now mails a link, and the default sender is a real SMTP client
 * pointed at Mailpit. In a suite with no Mailpit running that is a connection
 * refused per registration — swallowed, by design, but noisy in the output and
 * pointless work in every file that only needed an account to exist.
 *
 * The flow itself is exercised against the real sender in auth/verification.test.ts.
 */
export const noVerificationEmail: SendVerification = () => Promise.resolve();
