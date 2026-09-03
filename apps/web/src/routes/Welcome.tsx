import { useEffect, useState, type ReactElement } from 'react';
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
import styles from './Welcome.module.css';

/** What each provider's button says and shows. */
const PROVIDERS: Record<AuthProvider, { label: string; mark: () => ReactElement }> = {
  google: { label: 'Google', mark: GoogleMark },
};

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
   * Asked of the API rather than assumed, because the credentials live on the
   * server: a deployment with none configured offers none, and renders no
   * button rather than one that leads to a failure.
   *
   * Empty until the answer arrives, so the row appears rather than
   * disappearing — the reverse would move the buttons under somebody's thumb
   * as they reached for them.
   */
  const [providers, setProviders] = useState<AuthProvider[]>([]);

  useEffect(() => {
    let live = true;
    void api
      .listAuthProviders()
      .then((available) => {
        if (live) setProviders(available);
      })
      /* A gate that cannot reach the API still has both of its own buttons,
         which are the ones that matter. Nothing is worth saying here. */
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

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

            {providers.length > 0 && (
              <>
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
                  {providers.map((provider) => {
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
              </>
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
