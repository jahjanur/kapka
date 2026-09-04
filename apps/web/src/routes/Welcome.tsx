import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Navigate } from 'react-router-dom';
import {
  AppHeader,
  Button,
  CityScene,
  Container,
  GoogleMark,
  Icon,
  WelcomeArt,
} from '../components';
import { api, type AuthProvider } from '../lib/api';
import { PATHS } from './paths';
import { useDonorStatus } from '../lib/useDonorStatus';
import { useToast } from '../components';
import styles from './Welcome.module.css';

/** What each provider's button says and shows. */
const PROVIDERS: Record<AuthProvider, { label: string; mark: () => ReactElement }> = {
  google: { label: 'Google', mark: GoogleMark },
};

/**
 * Stands in for the real list while it is still being asked for.
 *
 * Only its height is ever used — the row is invisible until the answer
 * lands. One button and two are the same height, because the row lays them
 * out side by side, so this reserves the right space whatever comes back.
 */
const PENDING: AuthProvider[] = ['google'];

/**
 * The gate at /register (§9.2).
 *
 * Every "Register as donor" button in the product used to drop the reader
 * straight into a five-field sign-up form, with no way across for somebody
 * who already had an account. So this screen asks the one question that
 * decides everything after it, and says in one line what the account is for
 * while it does.
 *
 * The two buttons carry their icon at one end and a chevron at the other,
 * with the label centred between them. The chevron is the point: these are
 * the only two controls on the screen, both go somewhere rather than doing
 * something, and an arrow is what says so before the words are read.
 */
export default function Welcome() {
  /*
   * The route stays reachable — a bookmark, a link in an old email, a typed
   * URL — it just stops being a gate for somebody who is already through it.
   * Redirected rather than rewritten in place, because the answer to "where
   * do I register" for a registered donor is their own profile, and leaving
   * them on a page headed "Create account" is the doubt this whole change is
   * about.
   */
  const { isLoading, isRegisteredDonor } = useDonorStatus();
  const toast = useToast();
  /* A ref, not state: this latch exists so the toast is shown once, and it is
     never read during a render — making it state would ask React for another
     pass to record something nothing renders. */
  const announced = useRef(false);
  useEffect(() => {
    if (isLoading || !isRegisteredDonor || announced.current) return;
    announced.current = true;
    toast.show('You are already registered as a donor.');
  }, [isLoading, isRegisteredDonor, toast]);

  /*
   * Asked of the API rather than assumed, because the credentials live on the
   * server: a deployment with none configured offers none, and renders no
   * button rather than one that leads to a failure.
   *
   * `null` until the answer arrives, and that is not the same as `[]`. The
   * row has to hold its own space while it waits, or it drops in when the
   * answer lands and shoves everything above it 106px up the screen — which
   * is exactly what it used to do, under the thumb of somebody already
   * reaching for "Create account".
   */
  const [providers, setProviders] = useState<AuthProvider[] | null>(null);

  useEffect(() => {
    let live = true;
    void api
      .listAuthProviders()
      .then((available) => {
        if (live) setProviders(available);
      })
      /* A gate that cannot reach the API still has both of its own buttons,
         which are the ones that matter, so there is nothing to say here.
         There is something to DO: settle on "none", or the row stays in its
         reserved-but-invisible state for good and leaves a gap where a
         button is never going to appear. */
      .catch(() => {
        if (live) setProviders([]);
      });
    return () => {
      live = false;
    };
  }, []);

  const pending = providers === null;
  /* While pending the row is drawn from the placeholder and hidden, so the
     space it reserves is the real row's own height rather than a number
     guessed in the stylesheet. */
  const shown = providers ?? PENDING;

  /* After the hooks, never before: an early return above them would change
     how many run between renders. */
  if (!isLoading && isRegisteredDonor) return <Navigate to={PATHS.dashboard} replace />;

  return (
    <>
      <AppHeader />
      <div className={styles.page}>
        <Container className={styles.container}>
          <div className={styles.inner}>
            <WelcomeArt />

            <h1 className={styles.title}>
              One place for donors and the people who{' '}
              {/* The half of the sentence the product is actually about. */}
              <span className={styles.titleAccent}>need them</span>
            </h1>
            <p className={styles.lead}>
              Register once with your blood type and city, or sign in to the account you
              already have.
            </p>

            <div className={styles.actions}>
              <Button to={PATHS.createAccount} size="lg" fullWidth>
                <Icon name="user" className={styles.actionIcon} />
                Create account
                <Icon name="chevronRight" className={styles.actionChevron} />
              </Button>
              <Button to={PATHS.login} variant="secondary" size="lg" fullWidth>
                <Icon name="lock" className={styles.actionIcon} />
                Log in
                <Icon name="chevronRight" className={styles.actionChevron} />
              </Button>
            </div>

            {(pending || shown.length > 0) && (
              <div className={styles.providerBlock} data-pending={pending || undefined}>
                {/* The word is decoration over a rule; the rule is what does
                    the dividing, and it is drawn by the row rather than by a
                    border on the word. */}
                <p className={styles.or}>
                  <span>or continue with</span>
                </p>

                {/*
                  Plain anchors, not Buttons and not fetches. The whole flow
                  is redirects the API issues — this link leaves the app, the
                  API sends the browser to Google, and it comes back to
                  /auth/callback with a session cookie already set. That is
                  what keeps it clear of the app's `connect-src 'self'` policy
                  and its script-src hash pin, which an in-page provider SDK
                  would need unpicked (§12).
                */}
                <div className={styles.providers}>
                  {shown.map((provider) => {
                    const { label, mark: Mark } = PROVIDERS[provider];
                    return (
                      <a
                        key={provider}
                        className={styles.provider}
                        href={api.authStartUrl(provider)}
                      >
                        <Mark />
                        {label}
                      </a>
                    );
                  })}
                </div>
              </div>
            )}

            <p className={styles.privacy}>
              <Icon name="shieldCheck" />
              Your data is private and secure.
            </p>
          </div>
        </Container>

        <CityScene className={styles.scene} />
      </div>
    </>
  );
}
