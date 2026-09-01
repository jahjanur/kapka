import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppHeader, Button, Container, Icon } from '../components';
import { api, ApiError } from '../lib/api';
import { useSession } from '../lib/session';
import { PATHS } from './paths';
import styles from './VerifyEmail.module.css';

type Status =
  { state: 'working' } | { state: 'done' } | { state: 'failed'; message: string };

const GENERIC_FAILURE =
  'We could not confirm that link. It may have expired, or already been used.';

/**
 * Where a confirmation email lands (§12).
 *
 * The token arrives in the query string and is posted to the API from here
 * rather than the email linking at the API directly — a corporate mail scanner
 * follows links before the recipient does, and a GET that spent the token
 * would be spent by the scanner. Opening a page and posting from it is not
 * something a link-follower does.
 */
export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { session, signIn } = useSession();

  const [status, setStatus] = useState<Status>(() =>
    token ? { state: 'working' } : { state: 'failed', message: GENERIC_FAILURE },
  );
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState<string | null>(null);

  /* The confirming effect must not depend on the session, or signing the user
     in from inside it would re-run it and spend a second token. A ref keeps
     the latest value without making it a dependency — written in an effect of
     its own, because a ref is not for writing to during a render. */
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // StrictMode runs effects twice in development. The second post is answered
  // correctly by the API — a spent token whose account is verified is a
  // success — but there is no reason to send it.
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;

    void (async () => {
      try {
        const user = await api.verifyEmail(token);
        const current = sessionRef.current;
        // The header and any "confirm your email" prompt update immediately
        // rather than after the next sign-in.
        if (current) signIn({ ...current, user });
        setStatus({ state: 'done' });
      } catch (error) {
        setStatus({
          state: 'failed',
          message: error instanceof ApiError ? error.message : GENERIC_FAILURE,
        });
      }
    })();
  }, [token, signIn]);

  async function handleResend() {
    if (!session) return;
    setResent(null);
    setResending(true);
    try {
      const result = await api.resendVerification(session.accessToken);
      if (result.emailVerified) {
        setStatus({ state: 'done' });
        return;
      }
      setResent(`We sent a new link to ${session.user.email}.`);
    } catch (error) {
      setResent(
        error instanceof ApiError
          ? error.message
          : 'We could not send that email. Try again shortly.',
      );
    } finally {
      setResending(false);
    }
  }

  return (
    <>
      <AppHeader />
      <div className={styles.page}>
        <Container>
          <div className={styles.panel}>
            {status.state === 'working' && (
              <p className={styles.working} aria-live="polite">
                Confirming your email…
              </p>
            )}

            {status.state === 'done' && (
              <>
                <span className={styles.mark} aria-hidden="true">
                  <Icon name="checkCircle" />
                </span>
                <h1 className={styles.title}>Your email is confirmed</h1>
                <p className={styles.lead}>
                  You are on the donor list. From now on we will contact you only when
                  someone near you needs your blood type.
                </p>
                <div className={styles.actions}>
                  <Button to={PATHS.feed} size="lg">
                    See open requests
                  </Button>
                </div>
              </>
            )}

            {status.state === 'failed' && (
              <>
                <span className={`${styles.mark} ${styles.markBad}`} aria-hidden="true">
                  <Icon name="alertCircle" />
                </span>
                <h1 className={styles.title}>We could not confirm that link</h1>
                {/* role="alert" only here: the working and done states are
                    announced by the live region and the heading. */}
                <p className={styles.lead} role="alert">
                  {status.message}
                </p>

                <div className={styles.actions}>
                  {session ? (
                    <Button
                      size="lg"
                      onClick={() => void handleResend()}
                      loading={resending}
                      loadingLabel="Sending a new link…"
                    >
                      Send me a new link
                    </Button>
                  ) : (
                    /* Nobody signed in: asking for a link needs an account, so
                       the honest next step is to sign in or register. */
                    <Button to={PATHS.register} size="lg">
                      Register as donor
                    </Button>
                  )}
                </div>

                {resent && (
                  <p className={styles.note} aria-live="polite">
                    {resent}
                  </p>
                )}
              </>
            )}
          </div>
        </Container>
      </div>
    </>
  );
}
