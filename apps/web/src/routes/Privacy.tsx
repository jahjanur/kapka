import { AppHeader, Button, Container, Icon } from '../components';
import { DONATION_INTERVAL_DAYS } from '@kapka/shared';
import { PATHS } from './paths';
import styles from './Privacy.module.css';

/**
 * What Kapka stores, and why (§12).
 *
 * Written against the schema rather than from a template. Every table that
 * holds anything about a person is named here, and privacy.test.ts fails if a
 * migration adds one that is not — a notice that quietly falls behind the
 * database is worse than no notice, because it is a promise nobody kept.
 *
 * The plain-language rule for this page: say what is stored, say why it has
 * to be, and say what we do not do. Somebody deciding whether to hand over
 * their blood type should be able to read it in one sitting.
 */
export default function Privacy() {
  return (
    <>
      <AppHeader />
      <div className={styles.page}>
        <Container width="text">
          <article className={styles.notice}>
            <h1 className={styles.title}>What we store, and why</h1>
            <p className={styles.lead}>
              Kapka exists to put a person who needs blood in touch with people who can
              give it. That needs a small amount of information about you, and this page
              says exactly what, exactly why, and what happens to it.
            </p>

            <section className={styles.section}>
              <h2 className={styles.heading}>If you register as a donor</h2>
              <dl className={styles.facts}>
                <div>
                  <dt>Your name and email address</dt>
                  <dd>
                    The email is how we reach you when someone nearby needs your blood
                    type, and it is how you sign in. Your name is used to address that
                    email so it does not read like a machine wrote it.
                  </dd>
                </div>
                <div>
                  <dt>Your password</dt>
                  <dd>
                    Stored as a bcrypt hash, never as the password. Nobody at Kapka can
                    read it, and it cannot be recovered from what we hold — only reset.
                  </dd>
                </div>
                <div>
                  <dt>Your blood type and your city</dt>
                  <dd>
                    These are what the matching is. A request is sent to donors whose
                    blood type can help the patient and who are in the same city; with
                    either one missing there is nothing to match on.
                  </dd>
                </div>
                <div>
                  <dt>The date you last donated, if you tell us</dt>
                  <dd>
                    So we do not email you during the {DONATION_INTERVAL_DAYS} days when
                    you cannot give anyway. Leave it blank and we treat you as able to
                    give.
                  </dd>
                </div>
                <div>
                  <dt>Your phone number, if you give one</dt>
                  <dd>
                    Optional. It is shared only with a hospital whose request you have
                    agreed to help with. It is never on the public feed and never shown to
                    other donors.
                  </dd>
                </div>
              </dl>
            </section>

            <section className={styles.section}>
              <h2 className={styles.heading}>If you post a request</h2>
              <p className={styles.body}>
                The hospital, the city, the blood type and how many units, the urgency, a
                contact phone number, and anything you write in the note. Optionally a
                point on a map, if you place one.
              </p>
              <p className={styles.body}>
                All of that is shown publicly once an administrator approves it, except
                the phone number — that is shown only to people who are signed in. The
                note is written by you and is public, so it should never contain a
                patient&rsquo;s name or anything about their condition.
              </p>
            </section>

            <section className={styles.section}>
              <h2 className={styles.heading}>What we record about the emails we send</h2>
              <p className={styles.body}>
                For every notification: which request it was about, who it went to,
                whether it was sent, and when. This is how we avoid emailing you twice
                about the same request, and how we stay inside the daily limit of the
                service that delivers the mail.
              </p>
              <p className={styles.body}>
                If you sign in with Google, we keep the account link that makes that work:
                Google&rsquo;s own id for you, and nothing else from them. We never
                receive your Google password, and we cannot see anything else in your
                Google account. Unlink it by deleting your Kapka account.
              </p>
              <p className={styles.body}>
                We also keep an administrative log of approvals, rejections and expiries —
                who did what, and when — so a decision that reached thousands of people
                can be accounted for afterwards.
              </p>
            </section>

            <section className={styles.section}>
              <h2 className={styles.heading}>What we never do</h2>
              <ul className={styles.list}>
                <li>
                  <Icon name="checkCircle" />
                  We do not show your details to anyone. A person who posts a request
                  never learns which donors were emailed, or how many.
                </li>
                <li>
                  <Icon name="checkCircle" />
                  We do not sell, share or rent anything to anyone, for any purpose.
                </li>
                <li>
                  <Icon name="checkCircle" />
                  We do not track you. There is no analytics, no advertising, and no
                  third-party script on this site.
                </li>
                <li>
                  <Icon name="checkCircle" />
                  We do not email you about anything except a request your blood type can
                  help with, in your city, that an administrator has approved.
                </li>
              </ul>
            </section>

            <section className={styles.section}>
              <h2 className={styles.heading}>Who else sees anything</h2>
              <dl className={styles.facts}>
                <div>
                  <dt>SendGrid</dt>
                  <dd>
                    Delivers our email, so it receives your address and the message we
                    send you. It does not receive your blood type, your city or anything
                    else about you.
                  </dd>
                </div>
                <div>
                  <dt>OpenStreetMap</dt>
                  <dd>
                    Provides the map images on a request. Your browser fetches those
                    directly, so OpenStreetMap sees your IP address when a map is on
                    screen — the same as visiting any website. No map, no request.
                  </dd>
                </div>
                <div>
                  <dt>Google Maps</dt>
                  <dd>
                    Only if you press &ldquo;Directions&rdquo;. That opens Google Maps
                    with the hospital as the destination, and from that point you are on
                    Google&rsquo;s site under their terms, not ours.
                  </dd>
                </div>
                <div>
                  <dt>Google Sign-In</dt>
                  <dd>
                    Only if you choose it. Pressing &ldquo;Google&rdquo; takes you to
                    Google to sign in, so they know you signed in to Kapka. They tell us
                    your email address, your name, and their own id for you. If you never
                    press it, Google is never told anything.
                  </dd>
                </div>
                <div>
                  <dt>Render</dt>
                  <dd>Hosts the site and the database.</dd>
                </div>
              </dl>
            </section>

            <section className={styles.section}>
              <h2 className={styles.heading}>How long we keep it</h2>
              <ul className={styles.list}>
                <li>
                  <Icon name="clock" />
                  Your account and donor details: until you delete them.
                </li>
                <li>
                  <Icon name="clock" />A request: seven days, then it expires and stops
                  being shown.
                </li>
                <li>
                  <Icon name="clock" />A signed-in session: thirty days, or until you sign
                  out.
                </li>
                <li>
                  <Icon name="clock" />
                  An email confirmation link: twenty-four hours.
                </li>
                <li>
                  <Icon name="clock" />A half-finished request form: kept in your own
                  browser for twenty-four hours, so a dropped connection does not lose it.
                  It never leaves your device until you post it.
                </li>
              </ul>
            </section>

            <section className={styles.section}>
              <h2 className={styles.heading}>Taking your data, and leaving</h2>
              <p className={styles.body}>
                From your settings you can download everything we hold about you as a
                file, and you can delete your account. Deleting is real deletion: the
                account, your donor details and any requests you posted are removed from
                the database, not hidden or marked inactive.
              </p>
              <p className={styles.body}>
                One thing survives, and we would rather say so than let you find out. The
                record that we sent an email about a request stays, with your name and
                address taken off it. We keep the row because it is how the system counts
                what it has sent that day, and if those disappeared it would send past its
                limit and quietly fail to reach donors who are still here. What is left
                says an email was sent. It no longer says to whom.
              </p>
              <div className={styles.actions}>
                <Button to={PATHS.dashboard} variant="secondary">
                  Your settings
                </Button>
              </div>
            </section>

            <section className={styles.section}>
              <h2 className={styles.heading}>Asking us something</h2>
              <p className={styles.body}>
                If anything here is unclear, or you want something corrected or removed
                that you cannot do yourself, write to{' '}
                <a href="mailto:privacy@kapka.mk">privacy@kapka.mk</a>.
              </p>
            </section>
          </article>
        </Container>
      </div>
    </>
  );
}
