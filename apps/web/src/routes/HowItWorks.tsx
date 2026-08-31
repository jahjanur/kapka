import { AppHeader, Button, Container, Icon } from '../components';
import { DONATION_INTERVAL_DAYS } from '@kapka/shared';
import styles from './HowItWorks.module.css';

const DONOR_STEPS = [
  {
    title: 'Register once',
    body: 'Your blood type, your city, and when you last gave. Nothing else.',
  },
  {
    title: 'We watch for matches',
    body: 'When a hospital posts a request an admin has approved, we check who is compatible, nearby and eligible today.',
  },
  {
    title: 'You get one email',
    body: 'It says the blood type, the hospital and the city. If you can go, you go. If you cannot, you ignore it — nothing chases you.',
  },
];

const REQUESTER_STEPS = [
  {
    title: 'Post the request',
    body: 'Blood type, units, hospital, city, and a line about the situation.',
  },
  {
    title: 'An admin reviews it',
    body: 'Every request is checked before a single email goes out. This is the step that keeps the platform worth trusting.',
  },
  {
    title: 'Matching donors hear immediately',
    body: 'Everyone compatible and eligible in that city is emailed at once — not one at a time down a phone list.',
  },
];

/** The explanation the feed links to, for people deciding whether to sign up. */
export default function HowItWorks() {
  return (
    <>
      <AppHeader />

      <div className={styles.page}>
        <Container>
          <header className={styles.head}>
            <h1 className={styles.title}>How Kapka works</h1>
            <p className={styles.lead}>
              The gap between “I need blood” and “the right people know” is usually hours
              of phone calls. Kapka closes it to one email.
            </p>
          </header>

          <section className={styles.section} aria-labelledby="donors">
            <h2 id="donors" className={styles.sectionHeading}>
              If you want to give
            </h2>
            <ol className={styles.steps}>
              {DONOR_STEPS.map((step, index) => (
                <li key={step.title} className={styles.step}>
                  <span className={styles.stepNumber} aria-hidden="true" data-numeric>
                    {index + 1}
                  </span>
                  <h3 className={styles.stepTitle}>{step.title}</h3>
                  <p className={styles.stepBody}>{step.body}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className={styles.section} aria-labelledby="requesters">
            <h2 id="requesters" className={styles.sectionHeading}>
              If you need blood
            </h2>
            <ol className={styles.steps}>
              {REQUESTER_STEPS.map((step, index) => (
                <li key={step.title} className={styles.step}>
                  <span className={styles.stepNumber} aria-hidden="true" data-numeric>
                    {index + 1}
                  </span>
                  <h3 className={styles.stepTitle}>{step.title}</h3>
                  <p className={styles.stepBody}>{step.body}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className={styles.section} aria-labelledby="eligibility">
            <h2 id="eligibility" className={styles.sectionHeading}>
              Am I eligible?
            </h2>
            <p className={styles.body}>
              You can give again {DONATION_INTERVAL_DAYS} days after your last donation,
              per WHO guidance. We track that date for you and simply will not email you
              before it passes — so an email from Kapka already means you are clear to go
              on the day it arrives.
            </p>
          </section>

          <div className={styles.cta}>
            <h2 className={styles.ctaHeading}>Ready?</h2>
            <p className={styles.ctaBody}>
              Registering takes about two minutes and one email address.
            </p>
            <Button to="/register" size="lg">
              Register as donor
              <Icon name="arrowRight" />
            </Button>
          </div>
        </Container>
      </div>
    </>
  );
}
