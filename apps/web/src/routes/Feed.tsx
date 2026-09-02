import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AppHeader,
  BloodTypeLabel,
  Button,
  Container,
  EmptyState,
  ErrorState,
  Field,
  FilterBar,
  FilterChip,
  Grid,
  Icon,
  type IconName,
  RequestCard,
  Picker,
  RequestCardSkeleton,
  Stack,
  VitalSign,
} from '../components';
import { BLOOD_TYPES, CITIES, type BloodType, type Urgency } from '@kapka/shared';
import { useCountUp } from '../lib/useCountUp';
import { useRequests } from '../lib/useRequests';
import { useSession } from '../lib/session';
import { PATHS } from './paths';
import styles from './Feed.module.css';

const URGENCIES: Urgency[] = ['critical', 'urgent', 'routine'];
const URGENCY_RANK: Record<Urgency, number> = { critical: 0, urgent: 1, routine: 2 };

/** What "View all requests" jumps to. */
const LIST_ID = 'requests';

const titleCase = (value: string) => (value[0] ?? '').toUpperCase() + value.slice(1);

/**
 * One tile of the stat strip. The number counts up to itself when it lands —
 * see useCountUp, which does nothing at all under prefers-reduced-motion.
 */
function Stat({
  icon,
  label,
  value,
  loading,
}: {
  icon: IconName;
  label: string;
  value: number;
  loading: boolean;
}) {
  const shown = useCountUp(value);
  return (
    <div className={styles.stat}>
      <span className={styles.statMark} aria-hidden="true">
        <Icon name={icon} />
      </span>
      {/* Tabular figures, so a count from 0 to 12 does not shuffle the two
          beside it on every frame. */}
      <dd data-numeric>{loading ? '—' : shown}</dd>
      <dt>{label}</dt>
    </div>
  );
}

export default function Feed() {
  const { data, isLoading, error, refetch } = useRequests();
  const { session, restoring } = useSession();

  /*
   * Registering is for somebody who has no account, and this screen used to
   * ask for it three times over regardless of who was reading. A donor who is
   * already on the list was invited to join it again; a requester or an admin
   * was pointed at a form that can only answer "that email already has an
   * account", because registering makes a NEW account rather than adding a
   * donor profile to the one you are signed in to.
   *
   * So the primary action follows the reader: register if there is nobody
   * signed in, your own settings if you are the donor being asked to
   * register, and otherwise the other thing this page is for.
   */
  const isDonor = session?.user.role === 'donor';
  const heroPrimary = !session
    ? { to: PATHS.register, label: 'Register as donor' }
    : isDonor
      ? { to: PATHS.dashboard, label: 'Your profile' }
      : null;

  const [urgency, setUrgency] = useState<Urgency | null>(null);
  const [bloodType, setBloodType] = useState<BloodType | null>(null);
  const [city, setCity] = useState('');
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 240);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const requests = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(
    () =>
      requests
        .filter(
          (request) =>
            (!urgency || request.urgency === urgency) &&
            (!bloodType || request.bloodType === bloodType) &&
            (!city || request.city === city),
        )
        // Most urgent first, then most recent. A feed that someone scans in a
        // hurry should not be ordered by whatever the database returned.
        .sort(
          (a, b) =>
            URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] ||
            Date.parse(b.createdAt) - Date.parse(a.createdAt),
        ),
    [requests, urgency, bloodType, city],
  );

  const stats = useMemo(
    () => ({
      open: requests.length,
      critical: requests.filter((request) => request.urgency === 'critical').length,
      cities: new Set(requests.map((request) => request.city)).size,
    }),
    [requests],
  );

  const activeFilters = (urgency ? 1 : 0) + (bloodType ? 1 : 0) + (city === '' ? 0 : 1);
  const clearFilters = () => {
    setUrgency(null);
    setBloodType(null);
    setCity('');
  };

  return (
    <>
      <AppHeader />

      {/* ── Hero ──────────────────────────────────────────────────────────
          The sentence, the two ways in, and the drop. Lit from behind by
          three slow washes of the product's own red on the canvas the rest
          of the page uses — the point of the wash is depth, not a second
          page.                                                            */}
      <section className={styles.hero}>
        <div className={styles.aurora} aria-hidden="true" />
        <div className={styles.grid} aria-hidden="true" />
        <Container>
          <div className={styles.heroGrid}>
            <div className={styles.heroCopy}>
              <h1 className={styles.heroTitle}>
                Be someone’s <span className={styles.heroTitleInk}>lifeline.</span>
              </h1>
              <p className={styles.heroLead}>
                Every drop of your blood can bring hope and save a life.
              </p>
              <div className={styles.heroActions}>
                {/* Read on the session as it stands rather than waiting for
                    the boot refresh: signed out is both the common case and
                    what the header assumes, so the pair of buttons is stable
                    for most readers instead of appearing a moment late. */}
                {heroPrimary && (
                  <Button to={heroPrimary.to} size="lg">
                    <Icon name="heart" />
                    {heroPrimary.label}
                  </Button>
                )}
                {/* The hero speaks to donors, but the person whose relative
                    needs blood lands here too, and the header nav that would
                    take them on is hidden on a phone. */}
                <Button
                  to={PATHS.postRequest}
                  variant={heroPrimary ? 'secondary' : 'primary'}
                  size="lg"
                >
                  <Icon name="clipboard" />
                  Post a request
                </Button>
              </div>
            </div>

            {/* Decorative: the sentence beside it says everything it says.
                Sized in the markup as well as the stylesheet, so the space it
                will occupy is known before it arrives and nothing under it
                jumps when it does. */}
            <img
              className={styles.heroArt}
              src="/img/hero-drop.jpg"
              alt=""
              width={804}
              height={900}
              /* The largest thing on the first screen, so it is fetched with
                 the markup rather than after it. */
              fetchPriority="high"
              decoding="async"
            />
          </div>
        </Container>

        {/* The product's pulse, as the line the band ends on. */}
        <VitalSign className={styles.heroWave} />
      </section>

      {/* ── What this is ───────────────────────────────────────────────────
          Three claims, each one either true of the product or checkable
          against it. Nothing here is a statistic we do not hold.          */}
      <section className={styles.pillars} aria-label="Why give blood">
        <Container>
          <ul className={styles.pillarList}>
            <li className={styles.pillar}>
              <span className={styles.pillarMark} aria-hidden="true">
                <Icon name="droplet" />
              </span>
              <h2 className={styles.pillarTitle}>Save lives</h2>
              <p className={styles.pillarBody}>
                One donation is split into three components, and can help up to three
                people.
              </p>
            </li>
            <li className={styles.pillar}>
              <span className={styles.pillarMark} aria-hidden="true">
                <Icon name="users" />
              </span>
              <h2 className={styles.pillarTitle}>For everyone</h2>
              <p className={styles.pillarBody}>
                Every blood type is needed. Yours is the one somebody is waiting for.
              </p>
            </li>
            <li className={styles.pillar}>
              <span className={styles.pillarMark} aria-hidden="true">
                <Icon name="shield" />
              </span>
              <h2 className={styles.pillarTitle}>Safe and private</h2>
              <p className={styles.pillarBody}>
                An admin checks every request, and your details are never shown on the
                public feed.
              </p>
            </li>
          </ul>
        </Container>
      </section>

      {/* ── What is happening now ──────────────────────────────────────────
          The live half of the page, above the list itself: the count is the
          real one, and the link goes to the requests it counts.           */}
      <section className={styles.nearby} aria-labelledby="nearby-heading">
        <Container>
          <div className={styles.nearbyGrid}>
            <div className={styles.nearbyCopy}>
              <h2 id="nearby-heading" className={styles.nearbyTitle}>
                Someone nearby <span className={styles.heroTitleInk}>needs blood.</span>
              </h2>
              <p className={styles.nearbyLead}>
                Real requests, from real hospitals, in the cities we cover.
              </p>

              <p className={styles.live}>
                <span className={styles.pulse} aria-hidden="true" />
                <span className={styles.liveText}>
                  Live in North Macedonia
                  <span className={styles.liveSub}>Open requests right now</span>
                </span>
                <span className={styles.liveCount} data-numeric>
                  {isLoading ? '—' : stats.open}
                </span>
              </p>

              {/* Down the page rather than to another screen: the list it
                  points at is on this one. */}
              <a className={styles.viewAll} href={`#${LIST_ID}`}>
                View all requests
                <Icon name="chevronRight" />
              </a>
            </div>

            <div className={styles.orbit} aria-hidden="true">
              <span className={styles.orbitRing} />
              <span className={styles.orbitRing} />
              <span className={styles.orbitCore}>
                <Icon name="user" />
              </span>
              <span className={styles.orbitDot} />
              <span className={styles.orbitDot} />
              <span className={styles.orbitDot} />
            </div>
          </div>
        </Container>
      </section>

      {/* ── The numbers ────────────────────────────────────────────────────
          The three the product actually knows. A "lives saved" counter would
          be the easiest thing here to invent and the one nobody could check.
          ------------------------------------------------------------- */}
      <section className={styles.numbersBand} aria-label="Open requests right now">
        <Container>
          <dl className={styles.numbers}>
            <Stat
              icon="droplet"
              label="Open requests"
              value={stats.open}
              loading={isLoading}
            />
            <Stat
              icon="alertTriangle"
              label="Critical"
              value={stats.critical}
              loading={isLoading}
            />
            <Stat icon="mapPin" label="Cities" value={stats.cities} loading={isLoading} />
          </dl>
        </Container>
      </section>

      {/* ── How it works ───────────────────────────────────────────────────
          The real three steps, which are not the three a stock landing page
          would use: the middle one is ours doing the work, not the donor.
          ------------------------------------------------------------- */}
      <section className={styles.steps} aria-labelledby="steps-heading">
        <Container>
          <div className={styles.stepsHead}>
            <h2 id="steps-heading" className={styles.stepsTitle}>
              How it works
            </h2>
            <Link className={styles.viewAll} to={PATHS.howItWorks}>
              View more
              <Icon name="chevronRight" />
            </Link>
          </div>

          <ol className={styles.stepList}>
            <li className={styles.step}>
              <span className={styles.stepNumber}>1</span>
              <span className={styles.stepMark} aria-hidden="true">
                <Icon name="clipboard" />
              </span>
              <h3 className={styles.stepTitle}>Register</h3>
              <p className={styles.stepBody}>
                Your blood type and city, in about two minutes.
              </p>
            </li>
            <li className={styles.step}>
              <span className={styles.stepNumber}>2</span>
              <span className={styles.stepMark} aria-hidden="true">
                <Icon name="droplet" />
              </span>
              <h3 className={styles.stepTitle}>We email you</h3>
              <p className={styles.stepBody}>
                Only when an approved request matches your type and your city.
              </p>
            </li>
            <li className={styles.step}>
              <span className={styles.stepNumber}>3</span>
              <span className={styles.stepMark} aria-hidden="true">
                <Icon name="heart" />
              </span>
              <h3 className={styles.stepTitle}>You give</h3>
              <p className={styles.stepBody}>
                At the hospital that asked. One donation, up to three people.
              </p>
            </li>
          </ol>
        </Container>
      </section>

      {/* ── Filters and list ───────────────────────────────────────────────
          One grid holds both, so the filters can be a strip above the cards
          on a phone and a column beside them on a wide screen without the
          markup changing. Sticky in both places, from the same rule.       */}
      <div className={styles.page} id={LIST_ID}>
        <Container>
          <div className={styles.layout}>
            <aside className={styles.filters} aria-label="Filter requests">
              {/*
                One swipeable strip on a phone: eleven chips will not fit
                across 360px, and stacking them costs the space the first
                request needs. In the rail there is nothing to swipe with, so
                the same row is told to wrap instead — FilterBar exposes
                --filter-wrap for exactly this.
              */}
              <FilterBar label="Urgency and blood type">
                <div className={styles.group} role="group" aria-label="Filter by urgency">
                  <span className={styles.groupLabel}>Urgency</span>
                  {URGENCIES.map((level) => (
                    <FilterChip
                      key={level}
                      selected={urgency === level}
                      onClick={() => setUrgency(urgency === level ? null : level)}
                    >
                      {titleCase(level)}
                    </FilterChip>
                  ))}
                </div>

                <span className={styles.divider} aria-hidden="true" />

                <div
                  className={styles.group}
                  role="group"
                  aria-label="Filter by blood type"
                >
                  <span className={styles.groupLabel}>Blood type</span>
                  {BLOOD_TYPES.map((type) => (
                    <FilterChip
                      key={type}
                      selected={bloodType === type}
                      onClick={() => setBloodType(bloodType === type ? null : type)}
                    >
                      <BloodTypeLabel type={type} />
                    </FilterChip>
                  ))}
                </div>
              </FilterBar>

              {/* Outside the scroller. City is the filter most people reach
                  for, and it should never be somewhere you have to swipe to. */}
              <div className={styles.controls}>
                <Field label="City" hideLabel>
                  <Picker
                    placeholder="Anywhere"
                    icon="mapPin"
                    options={CITIES}
                    value={city}
                    onChange={setCity}
                  />
                </Field>

                {activeFilters > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    <Icon name="close" />
                    Clear
                  </Button>
                )}
              </div>
            </aside>

            {/* A landmark, not a div: this is what somebody jumping by
                region is after, and it is where "View all requests" lands.
                The heading names it and is otherwise for screen readers —
                the count under it says the same thing on screen. */}
            <section className={styles.list} aria-labelledby="requests-heading">
              <Stack gap={4}>
                <h2 id="requests-heading" className="visually-hidden">
                  Requests
                </h2>
                <p className={styles.resultCount} aria-live="polite">
                  {isLoading
                    ? 'Loading requests…'
                    : `${filtered.length} open ${filtered.length === 1 ? 'request' : 'requests'}`}
                </p>

                {isLoading && (
                  <Grid minColumn="19rem" gap={4}>
                    {Array.from({ length: 6 }, (_, index) => (
                      <RequestCardSkeleton key={index} />
                    ))}
                  </Grid>
                )}

                {error && (
                  <ErrorState error={error} subject="the requests" onRetry={refetch} />
                )}

                {!isLoading &&
                  !error &&
                  filtered.length === 0 &&
                  (activeFilters > 0 ? (
                    <EmptyState
                      icon="filter"
                      headline="No requests match these filters"
                      body="Widen the search and the open requests will reappear."
                      action={
                        <Button variant="secondary" onClick={clearFilters}>
                          Clear filters
                        </Button>
                      }
                    />
                  ) : (
                    <EmptyState
                      headline="No open requests right now"
                      body={
                        !session
                          ? 'That is good news. Register as a donor and we will email you the moment someone with your blood type needs help.'
                          : isDonor
                            ? 'That is good news. We will email you the moment someone with your blood type needs help.'
                            : 'That is good news. New requests appear here once an admin has approved them.'
                      }
                      action={
                        session ? undefined : (
                          <Button to={PATHS.register}>Register as donor</Button>
                        )
                      }
                    />
                  ))}

                {!isLoading && !error && filtered.length > 0 && (
                  <Grid minColumn="19rem" gap={4}>
                    {filtered.map((request) => (
                      <RequestCard key={request.id} request={request} />
                    ))}
                  </Grid>
                )}
              </Stack>
            </section>
          </div>
        </Container>
      </div>

      {/* Thumb zone: the primary action follows you down the page on a phone —
          for a reader who has an account it is a bar over the feed offering
          them something they have already done, so it does not appear at all.

          This one waits for the boot refresh, where the hero does not: it is
          hidden until 240px of scroll anyway, so waiting costs nothing and a
          fixed bar flashing in and out over the cards would be worse than a
          button that settles. */}
      {!restoring && !session && (
        <div className={`${styles.mobileCta} ${scrolled ? styles.mobileCtaVisible : ''}`}>
          <Button to={PATHS.register} fullWidth size="lg">
            Register as donor
          </Button>
        </div>
      )}
    </>
  );
}
