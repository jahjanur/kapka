import { AppHeader, Button, CityScene, Container, Icon, WelcomeArt } from '../components';
import { PATHS } from './paths';
import styles from './Welcome.module.css';

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

            {/* The word is decoration over a rule; the rule is what does the
                dividing, and it is drawn by the row rather than by a border
                on the word. */}
            <p className={styles.or}>
              <span>or</span>
            </p>

            {/* Somebody whose relative needs blood lands on this screen too,
                and neither button above is for them. A panel rather than a
                third button: it is a different errand, not a third way to do
                the same one. */}
            <div className={styles.aside}>
              <span className={styles.asideIcon}>
                <Icon name="heart" />
              </span>
              <div>
                <p className={styles.asideLead}>Need blood rather than giving it?</p>
                <a className={styles.asideLink} href={PATHS.postRequest}>
                  Post a request
                  <Icon name="chevronRight" />
                </a>
              </div>
            </div>

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
