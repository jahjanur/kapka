import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import {
  AppHeader,
  BloodBag,
  BloodTypeBadge,
  BloodTypeLabel,
  Button,
  Card,
  Container,
  EmptyState,
  ErrorState,
  Icon,
  Skeleton,
  Stack,
  UrgencyPill,
} from '../components';
import { cx } from '../lib/cx';
import { announceBloodType, DONATION_INTERVAL_DAYS } from '@kapka/shared';
import { useRequest } from '../lib/useRequests';
import { useSession } from '../lib/session';
import { timeAgo } from '../lib/relativeTime';
import { directionsUrl, isDiallable, telHref } from '../lib/directions';
import { PATHS } from './paths';
import type { IconName } from '../components';
import styles from './RequestDetail.module.css';

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

type PanelTone = 'quote' | 'plain' | 'practical';

/**
 * One named panel of the record.
 *
 * Each section is its own inset surface rather than a hairline band across a
 * single sheet: on a phone the record is four screens long, and a heading in
 * the same ink on the same white as the sentence above it is a heading you
 * scroll straight past. A panel has an edge, so you can find the one you
 * came back for without reading the two before it.
 *
 * The icon is the heading's, not decoration — it is what makes the four
 * panels tellable apart at a glance, before any of the words are read — so
 * it is inside the <h2> and hidden from the screen reader, which has the
 * heading itself to navigate by.
 */
function Panel({
  icon,
  tone,
  heading,
  chip = false,
  children,
}: {
  icon: IconName;
  tone: PanelTone;
  heading: string;
  /** Sets the heading icon in a tile, for a panel whose body is indented under it. */
  chip?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={cx(styles.panel, styles[tone], chip && styles.panelChipped)}>
      <h2 className={styles.panelHeading}>
        <span className={cx(styles.icon, chip && styles.chip)}>
          <Icon name={icon} />
        </span>
        {heading}
      </h2>
      <div className={styles.panelBody}>{children}</div>
    </section>
  );
}

/** A tiled icon, the size the rows and the chipped headings share. */
function Tile({ icon }: { icon: IconName }) {
  return (
    <span className={cx(styles.icon, styles.chip)}>
      <Icon name={icon} />
    </span>
  );
}

/** One labelled value of the record: icon, label, figure at the end. */
function Fact({
  icon,
  label,
  children,
}: {
  icon: IconName;
  label: string;
  children: ReactNode;
}) {
  /* The tile lives inside the <dt>, not beside it: a <dl>'s groups may hold
     only <dt> and <dd>, and a decoration slipped between them is an axe
     failure — which is how this screen went 0.94 on CI. */
  return (
    <div className={styles.fact}>
      <dt>
        <Tile icon={icon} />
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

/** One thing to do before going, as a row of its own. */
function Prep({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <li>
      <Tile icon={icon} />
      <span>{children}</span>
    </li>
  );
}

/** One request in full (§9.4). */
export default function RequestDetail() {
  const { id = '' } = useParams();
  const { session, restoring } = useSession();
  const {
    data: request,
    isLoading,
    error,
    refetch,
  } = useRequest(id, session?.accessToken);

  const phone = request?.contactPhone;
  const fit = request?.fit;

  /* "Register as donor" is for people who cannot register — asking somebody
     who just signed up to sign up again is the one thing this screen must not
     do. `restoring` counts as signed in: the boot refresh has not answered
     yet, and a CTA that flashes on every reload is the same bug with a
     shorter fuse (see SessionValue.restoring). */
  const signedOut = !session && !restoring;

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
                {/* One card holding the record, and inside it one named panel
                    per section. */}
                <Card className={styles.record}>
                  <header>
                    <div className={styles.headTop}>
                      <BloodTypeBadge
                        type={request.bloodType}
                        size="lg"
                        className={styles.headBadge}
                      />
                      <UrgencyPill urgency={request.urgency} />
                      {/* How old the request is belongs beside how urgent it
                        is, not four sections down under "Details" — on a
                        critical request the two are read together. */}
                      <time className={styles.posted} dateTime={request.createdAt}>
                        <Icon name="clock" />
                        {timeAgo(request.createdAt)}
                      </time>
                    </div>

                    <div className={styles.headBody}>
                      <div className={styles.headText}>
                        <h1 className={styles.title}>
                          {request.unitsNeeded}
                          {request.unitsNeeded === 1 ? ' unit' : ' units'} of{' '}
                          <BloodTypeLabel type={request.bloodType} /> needed
                        </h1>
                        <p className={styles.where}>
                          <Icon name="mapPin" />
                          {request.hospitalName}, {request.city}
                        </p>
                        {/* Spelled out for a screen reader, which would
                            otherwise read "O-" as the letter O followed by a
                            hyphen. */}
                        <span className="visually-hidden">
                          {announceBloodType(request.bloodType)}
                        </span>
                      </div>

                      {/* Held back under about 26rem of card: at 360px it
                          would take a third of the line and push the title
                          into four. */}
                      <BloodBag className={styles.headArt} />
                    </div>
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
                      className={cx(
                        styles.fit,
                        fit.compatible ? styles.fitYes : styles.fitNo,
                      )}
                    >
                      <span className={cx(styles.icon, styles.chip)}>
                        <Icon name={fit.compatible ? 'checkCircle' : 'info'} />
                      </span>
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
                    <Panel icon="hospital" tone="quote" heading="From the hospital" chip>
                      <p className={styles.note}>{request.note}</p>
                    </Panel>
                  )}

                  {/* Label left, value right, a hairline between each — the
                      shape a reference block has had since long before this
                      product, and the one people read fastest. The icon on
                      each row is what the row is about, so the three can be
                      told apart without reading the labels. */}
                  <Panel icon="info" tone="plain" heading="Details">
                    <dl className={styles.facts}>
                      <Fact icon="droplet" label="Units needed">
                        {request.unitsNeeded}
                      </Fact>
                      <Fact icon="calendar" label="Open until">
                        <time dateTime={request.expiresAt}>
                          {longDate(request.expiresAt)}
                        </time>
                      </Fact>
                      <Fact icon="mapPin" label="City">
                        {request.city}
                      </Fact>
                    </dl>
                  </Panel>

                  {/* The eligibility rule is a sentence; the three practical
                      things are a line. Separating them stops the one thing
                      that can send somebody home from the door being read as
                      the fourth item in a list of chores. */}
                  <Panel icon="checkCircle" tone="practical" heading="Before you go">
                    <ul className={styles.prepList}>
                      <Prep icon="calendarCheck">
                        You can give again {DONATION_INTERVAL_DAYS} days after your last
                        donation.
                      </Prep>
                      <Prep icon="idCard">
                        <span className={styles.pair}>
                          <span>Bring photo ID</span>
                          <span>Eat beforehand</span>
                        </span>
                      </Prep>
                      <Prep icon="clock">Allow about an hour</Prep>
                    </ul>
                  </Panel>
                </Card>
              </div>

              {/* Sticky on a wide screen, and the first thing under the fold
                  on a phone — either way it is never more than a scroll away. */}
              <aside className={styles.rail}>
                <Card>
                  {signedOut && (
                    <>
                      <h2 className={styles.actionHeading}>Can you help?</h2>
                      <p className={styles.actionBody}>
                        Register with your blood type and city. We email you whenever a
                        matching request is approved — this one included.
                      </p>
                      <Button to="/register" fullWidth size="lg">
                        Register as donor
                      </Button>
                    </>
                  )}

                  <div className={styles.contact}>
                    <h3 className={styles.contactHeading}>Hospital contact</h3>
                    {isDiallable(phone) ? (
                      <p className={styles.contactBody}>
                        <Icon name="phone" />
                        <a href={telHref(phone)} className={styles.phoneLink}>
                          {phone}
                        </a>
                      </p>
                    ) : signedOut ? (
                      <p className={styles.contactBody}>
                        <Icon name="eyeOff" />
                        Hidden while you are signed out. Contact details are never shown
                        on the public feed (§12).
                      </p>
                    ) : (
                      /* Signed in and still no number: the hospital never gave
                         one. Saying "sign in to see it" here would send a donor
                         looking for something that does not exist. */
                      <p className={styles.contactBody}>
                        <Icon name="info" />
                        This hospital has not listed a number. Directions are below.
                      </p>
                    )}
                  </div>
                </Card>
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
                className={cx(styles.action, styles.actionPrimary)}
                href={telHref(phone)}
              >
                <Icon name="phone" />
                Call the hospital
              </a>
            ) : signedOut ? (
              /* A Button, styled as one — the class it carries sizes it in the
                 row and nothing else. It used to also carry .action, which set
                 a surface and a border over the top of Button's own primary
                 styling and worked only because of the order two stylesheets
                 happened to land in. */
              <Button to={PATHS.register} className={styles.actionButton} size="md">
                <Icon name="heart" />
                {/* Two labels, one shown: the long one needs 245px and the
                    button only has that much room from about 460px up. */}
                <span className={styles.actionShort}>Register</span>
                <span className={styles.actionLong}>Register to see the number</span>
              </Button>
            ) : null}
          </Container>
        </div>
      )}
    </>
  );
}
