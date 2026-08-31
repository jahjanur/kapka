import { useParams } from 'react-router-dom';
import {
  AppHeader,
  BloodTypeBadge,
  BloodTypeLabel,
  Button,
  Container,
  EmptyState,
  Icon,
  Skeleton,
  Stack,
  UrgencyPill,
} from '../components';
import { announceBloodType, DONATION_INTERVAL_DAYS } from '@kapka/shared';
import { useRequest } from '../lib/useRequests';
import { useSession } from '../lib/session';
import { timeAgo } from '../lib/relativeTime';
import styles from './RequestDetail.module.css';

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

/** One request in full (§9.4). */
export default function RequestDetail() {
  const { id = '' } = useParams();
  const { data: request, isLoading, error, refetch } = useRequest(id);
  const { session } = useSession();

  return (
    <>
      <AppHeader />

      <div className={styles.page}>
        <Container>
          <a className={styles.back} href="/">
            <Icon name="chevronRight" className={styles.backIcon} />
            All requests
          </a>

          {isLoading && (
            <Stack gap={4} className={styles.skeleton}>
              <Skeleton width="12rem" height="2.5rem" shape="circle" />
              <Skeleton width="90%" height="2.5rem" />
              <Skeleton width="60%" height="1.25rem" />
              <Skeleton width="100%" height="8rem" />
            </Stack>
          )}

          {error && (
            <div className={styles.state}>
              {error.code === 'NOT_FOUND' ? (
                <EmptyState
                  icon="alertCircle"
                  headline="That request is not here"
                  body="It may have been fulfilled, or the link may be wrong. The open requests are all on the feed."
                  action={<Button to="/">Back to requests</Button>}
                />
              ) : (
                <EmptyState
                  icon="alertTriangle"
                  headline="We couldn’t load this request"
                  body="The connection dropped on the way. Nothing is lost — try again."
                  action={<Button onClick={refetch}>Try again</Button>}
                />
              )}
            </div>
          )}

          {request && (
            <article className={styles.layout}>
              <div className={styles.main}>
                <header className={styles.head} data-urgency={request.urgency}>
                  <div className={styles.headTop}>
                    <BloodTypeBadge type={request.bloodType} size="lg" />
                    <UrgencyPill urgency={request.urgency} />
                  </div>
                  <h1 className={styles.title}>
                    {request.unitsNeeded}
                    {request.unitsNeeded === 1 ? ' unit' : ' units'} of{' '}
                    <BloodTypeLabel type={request.bloodType} /> needed
                  </h1>
                  <p className={styles.where}>
                    <Icon name="mapPin" />
                    {request.hospitalName}, {request.city}
                  </p>
                  {/* Spelled out for a screen reader, which would otherwise
                      read "O-" as the letter O followed by a hyphen. */}
                  <span className="visually-hidden">
                    {announceBloodType(request.bloodType)}
                  </span>
                </header>

                {request.note && (
                  <section className={styles.section}>
                    <h2 className={styles.sectionHeading}>From the hospital</h2>
                    <p className={styles.note}>{request.note}</p>
                  </section>
                )}

                <section className={styles.section}>
                  <h2 className={styles.sectionHeading}>Details</h2>
                  <dl className={styles.facts}>
                    <div className={styles.fact}>
                      <dt>Units needed</dt>
                      <dd data-numeric>{request.unitsNeeded}</dd>
                    </div>
                    <div className={styles.fact}>
                      <dt>Posted</dt>
                      <dd>
                        <time dateTime={request.createdAt}>
                          {timeAgo(request.createdAt)}
                        </time>
                      </dd>
                    </div>
                    <div className={styles.fact}>
                      <dt>Open until</dt>
                      <dd>
                        <time dateTime={request.expiresAt}>
                          {longDate(request.expiresAt)}
                        </time>
                      </dd>
                    </div>
                    <div className={styles.fact}>
                      <dt>City</dt>
                      <dd>{request.city}</dd>
                    </div>
                  </dl>
                </section>

                {/*
                  There is deliberately no "who else can give" panel here.
                  Working the compatibility matrix out in the browser would
                  put a second copy of a medical rule in the codebase, free to
                  drift from the one in the database that actually decides who
                  gets emailed (§3). If this is worth showing, it comes from
                  the API that reads that table — not from a re-derivation.
                */}
                <section className={styles.section}>
                  <h2 className={styles.sectionHeading}>Before you go</h2>
                  <p className={styles.sectionLead}>
                    You can give again {DONATION_INTERVAL_DAYS} days after your last
                    donation. Bring photo ID, eat beforehand, and allow about an hour.
                  </p>
                </section>
              </div>

              {/* Sticky on a wide screen, and the first thing under the fold
                  on a phone — either way it is never more than a scroll away. */}
              <aside className={styles.rail}>
                <div className={styles.actionCard}>
                  <h2 className={styles.actionHeading}>Can you help?</h2>
                  <p className={styles.actionBody}>
                    Register with your blood type and city. We email you whenever a
                    matching request is approved — this one included.
                  </p>
                  <Button to="/register" fullWidth size="lg">
                    Register as donor
                  </Button>

                  <div className={styles.contact}>
                    <h3 className={styles.contactHeading}>Hospital contact</h3>
                    {session ? (
                      <p className={styles.contactBody}>
                        <Icon name="phone" />
                        Contact details are released to signed-in donors once the request
                        is matched to you.
                      </p>
                    ) : (
                      <p className={styles.contactBody}>
                        <Icon name="eyeOff" />
                        Hidden while you are signed out. Contact details are never shown
                        on the public feed (§12).
                      </p>
                    )}
                  </div>
                </div>
              </aside>
            </article>
          )}
        </Container>
      </div>
    </>
  );
}
