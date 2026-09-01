import { lazy, Suspense } from 'react';
import { useParams } from 'react-router-dom';
import {
  AppHeader,
  BloodTypeBadge,
  BloodTypeLabel,
  Button,
  Container,
  EmptyState,
  ErrorState,
  Icon,
  Skeleton,
  Stack,
  UrgencyPill,
} from '../components';
import { announceBloodType, DONATION_INTERVAL_DAYS } from '@kapka/shared';
import { useRequest } from '../lib/useRequests';
import { useSession } from '../lib/session';
import { timeAgo } from '../lib/relativeTime';
import { directionsUrl, isDiallable, telHref } from '../lib/directions';
import { PATHS } from './paths';
import styles from './RequestDetail.module.css';

/**
 * Leaflet is 150kB and this screen is opened from an email, on a phone, in a
 * corridor. It is a separate chunk, and it is only asked for at all when the
 * request actually carries a pin — most of the reason this is lazy is that
 * for a request without coordinates it is never fetched.
 */
const HospitalMap = lazy(() => import('../components/HospitalMap/HospitalMap'));

/**
 * A date, written out. Accepts a full timestamp or a bare YYYY-MM-DD.
 *
 * A bare day is parsed by Date as UTC midnight, which then formats as the
 * previous day for anyone west of Greenwich. Appending a time makes it local,
 * which is what a day with no time attached means to the person reading it.
 */
const longDate = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

/** One request in full (§9.4). */
export default function RequestDetail() {
  const { id = '' } = useParams();
  const { session } = useSession();
  const {
    data: request,
    isLoading,
    error,
    refetch,
  } = useRequest(id, session?.accessToken);

  const phone = request?.contactPhone;
  const fit = request?.fit;
  const hasPin =
    typeof request?.hospitalLat === 'number' && typeof request.hospitalLng === 'number';

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
                <ErrorState error={error} subject="this request" onRetry={refetch} />
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

                {/*
                  The answer comes from the API, which reads the same
                  blood_compatibility table the matching query reads. It is
                  not worked out here on purpose: a second copy of a medical
                  rule is free to drift from the one that actually decides who
                  gets emailed, and getting its direction backwards produces a
                  screen that runs and is wrong (§3, §5.1).
                */}
                {fit && (
                  <aside
                    className={`${styles.fit} ${fit.compatible ? styles.fitYes : styles.fitNo}`}
                  >
                    <Icon name={fit.compatible ? 'checkCircle' : 'info'} />
                    <div>
                      {fit.compatible ? (
                        <>
                          <p className={styles.fitHeadline}>
                            Your <BloodTypeLabel type={fit.bloodType} /> can help here
                          </p>
                          {fit.eligibleFrom ? (
                            /* Compatible and cannot give yet. Saying only the
                               first half sends somebody to a hospital that
                               will turn them away at the door. */
                            <p className={styles.fitBody}>
                              You are eligible to give again on{' '}
                              <time dateTime={fit.eligibleFrom}>
                                {longDate(fit.eligibleFrom)}
                              </time>
                              , {DONATION_INTERVAL_DAYS} days after your last donation.
                            </p>
                          ) : (
                            <p className={styles.fitBody}>
                              You are eligible to give now. The hospital's number is at
                              the bottom of this page.
                            </p>
                          )}
                        </>
                      ) : (
                        <>
                          <p className={styles.fitHeadline}>
                            This patient cannot receive{' '}
                            <BloodTypeLabel type={fit.bloodType} />
                          </p>
                          <p className={styles.fitBody}>
                            Nothing to do here — but you will be emailed the moment a
                            request your type can help with is approved near you.
                          </p>
                        </>
                      )}
                    </div>
                  </aside>
                )}

                {request.note && (
                  <section className={styles.section}>
                    <h2 className={styles.sectionHeading}>From the hospital</h2>
                    <p className={styles.note}>{request.note}</p>
                  </section>
                )}

                {hasPin && (
                  <section className={styles.section}>
                    <h2 className={styles.sectionHeading}>Where to go</h2>
                    <Suspense
                      fallback={<div className={styles.mapLoading} aria-hidden="true" />}
                    >
                      <HospitalMap
                        lat={request.hospitalLat ?? null}
                        lng={request.hospitalLng ?? null}
                      />
                    </Suspense>
                    <p className={styles.mapNote}>
                      The pin is where the hospital put it. Directions open in your maps
                      app.
                    </p>
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
                    {isDiallable(phone) ? (
                      <p className={styles.contactBody}>
                        <Icon name="phone" />
                        <a href={telHref(phone)} className={styles.phoneLink}>
                          {phone}
                        </a>
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

      {/*
        The two things a donor who has decided actually does next, kept within
        thumb reach the whole way down. Outside the scrolling page, because a
        request read on a phone is longer than a screen and an action that has
        scrolled away is an action that does not happen.

        Directions is always here — it needs nothing but the address. Calling
        needs the number, and the number needs a session (§12), so signed out
        the second button is the way to get one rather than a dead tel: link.
      */}
      {request && (
        <div className={styles.actionBar}>
          <Container className={styles.actionBarInner}>
            <a
              className={styles.action}
              href={directionsUrl(request)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icon name="mapPin" />
              Directions
            </a>

            {isDiallable(phone) ? (
              <a
                className={`${styles.action} ${styles.actionPrimary}`}
                href={telHref(phone)}
              >
                <Icon name="phone" />
                Call the hospital
              </a>
            ) : (
              <Button to={PATHS.register} className={styles.action} size="md">
                {/* Two labels, one shown. At 360px the long one and
                    "Directions" together are wider than the screen, and the
                    button that was cut in half was the call to action. The
                    header solves it the same way. */}
                <span className={styles.actionShort}>Register</span>
                <span className={styles.actionLong}>Register to see the number</span>
              </Button>
            )}
          </Container>
        </div>
      )}
    </>
  );
}
