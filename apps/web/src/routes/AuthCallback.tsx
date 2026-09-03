import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthLayout, Button, Icon } from '../components';
import { useSession } from '../lib/session';
import { PATHS } from './paths';
import styles from './AuthCallback.module.css';

/**
 * What every way a provider sign-in can end says to the person it happened to.
 *
 * Written out rather than shown as a code, and each one ends with what to do
 * next — "state" and "provider" are the two nobody can act on, so they are
 * the two that say "try again" plainly instead of explaining themselves.
 */
const REASONS: Record<string, string> = {
  cancelled: 'You cancelled the Google sign-in. Nothing has changed.',
  expired: 'That sign-in took too long and had to be started again.',
  state: 'That sign-in could not be verified, so it was stopped. Please try again.',
  provider: 'Google could not be reached just now. Please try again in a moment.',
  unverified:
    'There is already an account with that email address, and Google has not confirmed you own it. Sign in with your password instead.',
  inactive: 'That account has been deactivated.',
};

const FALLBACK = 'That sign-in did not finish. Please try again.';

/**
 * Where the browser lands coming back from Google (§9.2).
 *
 * There is nothing in the URL to act on: the session arrives as an httpOnly
 * refresh cookie, and SessionProvider trades it for an access token on boot
 * exactly as it does after a reload. So this screen's whole job is to wait
 * for that to finish and then get out of the way — which is why it has no
 * fetching of its own.
 *
 * It exists at all because the alternative is redirecting straight to the
 * dashboard, where a sign-in that failed looks like being silently signed
 * out, with nothing on the screen saying why.
 */
export default function AuthCallback() {
  const [params] = useSearchParams();
  const { session, restoring } = useSession();
  const navigate = useNavigate();
  const error = params.get('error');

  useEffect(() => {
    /* replace, so Back does not return to a callback URL whose one-time code
       has already been spent. */
    if (!error && !restoring && session) {
      void navigate(PATHS.dashboard, { replace: true });
    }
  }, [error, restoring, session, navigate]);

  if (error) {
    return (
      <AuthLayout
        title="That did not work"
        subtitle="Nothing has been changed on your account."
        back={PATHS.register}
        mark
        centred
        scene
      >
        <p className={styles.message} role="alert">
          <Icon name="alertCircle" className={styles.messageIcon} />
          {REASONS[error] ?? FALLBACK}
        </p>
        <Button to={PATHS.register} size="lg" fullWidth>
          Back to sign in
        </Button>
      </AuthLayout>
    );
  }

  /* The restore is normally faster than this renders. It is still a real
     state on a slow connection, and a blank screen at the end of a sign-in
     is where people press Back. */
  return (
    <AuthLayout title="Signing you in" subtitle="One moment." mark centred scene>
      <p className={styles.waiting}>
        {restoring ? 'Finishing your sign-in…' : 'Almost there…'}
      </p>
      {!restoring && !session && (
        /* The restore finished and produced nothing: the cookie was refused
           or has already expired. Nothing to wait for, so say so rather than
           spin. */
        <>
          <p className={styles.message} role="alert">
            <Icon name="alertCircle" className={styles.messageIcon} />
            {FALLBACK}
          </p>
          <Link className={styles.link} to={PATHS.register}>
            Back to sign in
          </Link>
        </>
      )}
    </AuthLayout>
  );
}
