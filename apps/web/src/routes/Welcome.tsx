import { AppHeader, Button, Container, Icon, VitalSign } from '../components';
import { PATHS } from './paths';
import styles from './Welcome.module.css';

/**
 * The gate at /register (§9.2).
 *
 * Every "Register as donor" button in the product used to drop the reader
 * straight into a five-field sign-up form, with no way across for somebody
 * who already had an account — and until now there was nowhere to go anyway,
 * because the product had no sign-in screen at all.
 *
 * So this screen asks the one question that decides everything after it, and
 * says in one line what the account is for while it does.
 */
export default function Welcome() {
  return (
    <>
      <AppHeader />
      <div className={styles.page}>
        <Container>
          <div className={styles.inner}>
            {/* ── The illustration ────────────────────────────────────────
                A bag of blood and a heart, joined by the trace the feed's
                hero runs on. Drawn rather than photographed: a stock photo
                of a smiling donor is a promise a pilot cannot keep, and this
                is honest about being a diagram.                          */}
            <div className={styles.art} aria-hidden="true">
              <div className={styles.artRow}>
                <span className={styles.bag}>
                  <span className={styles.bagLabel}>A</span>
                  <span className={styles.bagFill} />
                </span>
                <span className={styles.heart}>
                  <Icon name="droplet" />
                </span>
              </div>
              <VitalSign className={styles.trace} />
            </div>

            <h1 className={styles.title}>
              One place for donors and the people who need them
            </h1>
            <p className={styles.lead}>
              Register once with your blood type and city, or sign in to the account you
              already have.
            </p>

            <div className={styles.actions}>
              <Button to={PATHS.createAccount} size="lg" fullWidth>
                Create account
              </Button>
              <Button to={PATHS.login} variant="secondary" size="lg" fullWidth>
                Log in
              </Button>
            </div>

            {/* Somebody whose relative needs blood lands on this screen too,
                and neither button above is for them. */}
            <p className={styles.aside}>
              Need blood rather than giving it?{' '}
              <a className={styles.asideLink} href={PATHS.postRequest}>
                Post a request
              </a>
            </p>
          </div>
        </Container>
      </div>
    </>
  );
}
