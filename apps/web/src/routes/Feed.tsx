import { useEffect, useMemo, useState } from 'react';
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
  type ChipTone,
  Grid,
  Icon,
  type IconName,
  RequestCard,
  Picker,
  RequestCardSkeleton,
  Skeleton,
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

/* The same three colours the pill on the card uses, so the filter and the
   thing it filters to are recognisably the same level. */
const URGENCY_TONE: Record<Urgency, ChipTone> = {
  critical: 'danger',
  urgent: 'warning',
  routine: 'info',
};

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

  /**
   * Which cities have open requests, most first, and how many of each are
   * critical.
   *
   * From the same list the cards below are drawn from, so the two can never
   * disagree — and it is the answer to the only question this section was
   * ever asking: where is this happening.
   */
  const byCity = useMemo(() => {
    const counts = new Map<string, { city: string; count: number; critical: number }>();
    for (const request of requests) {
      const row = counts.get(request.city) ?? {
        city: request.city,
        count: 0,
        critical: 0,
      };
      row.count += 1;
      if (request.urgency === 'critical') row.critical += 1;
      counts.set(request.city, row);
    }
    return [...counts.values()].sort(
      (a, b) =>
        b.critical - a.critical || b.count - a.count || a.city.localeCompare(b.city),
    );
  }, [requests]);

  /** Filters the list to one city and takes the reader to it. */
  const showCity = (name: string) => {
    setCity(name);
    document.getElementById(LIST_ID)?.scrollIntoView({ block: 'start' });
  };

  const activeFilters = (urgency ? 1 : 0) + (bloodType ? 1 : 0) + (city === '' ? 0 : 1);
  const clearFilters = () => {
    setUrgency(null);
    setBloodType(null);
    setCity('');
  };

  return (
    <>
      <AppHeader />

      {/* ── The landing view ───────────────────────────────────────────────
          Hero, numbers and nearby are one block on purpose: it is held to at
          least a screenful so the filter panel below can never surface as a
          sliver of card at the bottom edge. See .landing.                 */}
      <div className={styles.landing}>
        {/* ── Hero ────────────────────────────────────────────────────────
            The sentence, the two ways in, and the drop. Lit from behind by
            three slow washes of the product's own red on the canvas the rest
            of the page uses — the point of the wash is depth, not a second
            page.                                                          */}
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
                width={1072}
                height={1200}
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
              <Stat
                icon="mapPin"
                label="Cities"
                value={stats.cities}
                loading={isLoading}
              />
            </dl>
          </Container>
        </section>

        {/* ── What is happening now ──────────────────────────────────────────
            The live half of the page, above the list itself: the count is the
            real one, and the link goes to the requests it counts.           */}
        <section className={styles.nearby} aria-labelledby="nearby-heading">
          <Container>
            {/* The heading and the way out of the section sit on one line:
                somebody who wants the whole list should not have to read the
                cities first to find the link to it. */}
            <div className={styles.nearbyHead}>
              <h2 id="nearby-heading" className={styles.nearbyTitle}>
                Someone nearby <span className={styles.heroTitleInk}>needs blood.</span>
              </h2>
              <a className={styles.viewAll} href={`#${LIST_ID}`}>
                View all requests
                <Icon name="chevronRight" />
              </a>
            </div>
            <p className={styles.nearbyLead}>
              See what is needed in your area, and help save a life.
            </p>

            {isLoading && (
              /* Shaped like the chips that replace it, so nothing moves when
                 they land (§9.7). */
              <ul className={styles.cityList} aria-hidden="true">
                {Array.from({ length: 4 }, (_, i) => (
                  <li key={i}>
                    <Skeleton width="7rem" height="2.5rem" shape="circle" />
                  </li>
                ))}
              </ul>
            )}

            {!isLoading && byCity.length === 0 && (
              <p className={styles.nearbyEmpty}>
                Nothing is open right now — which is the good outcome. New requests appear
                here as an admin approves them.
              </p>
            )}

            {byCity.length > 0 && (
              <ul className={styles.cityList}>
                {byCity.map(({ city: name, count, critical }) => (
                  <li key={name}>
                    {/* A control, not a label: this is the filter the list
                        below already has, put where somebody is looking. */}
                    <button
                      type="button"
                      className={styles.cityChip}
                      /* Spelled out rather than left to the computed name,
                         which reads the city and the count with nothing
                         between them: "Skopje2". The red outline is also said
                         here in words — colour is never the only channel. */
                      aria-label={`${name}, ${String(count)} open ${
                        count === 1 ? 'request' : 'requests'
                      }${critical > 0 ? `, ${String(critical)} critical` : ''}`}
                      onClick={() => showCity(name)}
                    >
                      <Icon name="mapPin" />
                      {/* Its own element so it is the thing that truncates: as
                          a bare text node it pushed the count out of the chip
                          instead, and Kumanovo lost its number. */}
                      <span className={styles.cityName}>{name}</span>
                      <span className={styles.cityCount} data-numeric>
                        {count}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Container>
        </section>
      </div>

      {/* ── Filters and list ───────────────────────────────────────────────
          One grid holds both, so the filters can be a strip above the cards
          on a phone and a column beside them on a wide screen without the
          markup changing. Sticky in both places, from the same rule.       */}
      <div className={styles.page} id={LIST_ID}>
        <Container>
          <div className={styles.layout}>
            <aside className={styles.filters} aria-label="Filter requests">
              {/*
                Three sections — location, blood type, urgency — in that
                order, because a donor filters by the type they can give
                before anything else and the list is sorted by urgency
                already. Stacked in the rail, where they are a panel with
                room to breathe. On a phone the same markup is one swipeable
                strip: eleven chips will not fit across 360px, and stacking
                them costs the space the first request needs. FilterBar
                exposes --filter-wrap and friends for exactly that switch.
              */}
              <div className={styles.strip}>
                {/* Location leads and never scrolls — it is the filter most
                    people reach for, and it must never be somewhere you have
                    to swipe to. A field in the panel, a chip in the strip. */}
                <div className={styles.controls}>
                  {/* Decorative: the control's own label says the same word,
                      and saying it twice is what a screen reader would read
                      out twice. */}
                  <span className={styles.groupLabel} aria-hidden="true">
                    <Icon name="mapPin" className={styles.groupIcon} />
                    Location
                  </span>

                  <Field label="Location" hideLabel>
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

                <FilterBar label="Blood type and urgency">
                  <div
                    className={styles.bloodTypeGroup}
                    role="group"
                    aria-label="Filter by blood type"
                  >
                    <span className={styles.groupLabel} aria-hidden="true">
                      <Icon name="droplet" className={styles.groupIcon} />
                      Blood type
                    </span>
                    {/* "No blood type filter" as a chip of its own. Pressing
                        the selected chip again clears it too, but nobody
                        discovers that — this is the way out you can see. */}
                    <FilterChip
                      selected={bloodType === null}
                      onClick={() => setBloodType(null)}
                    >
                      All
                    </FilterChip>
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

                  <span className={styles.divider} aria-hidden="true" />

                  <div
                    className={styles.group}
                    role="group"
                    aria-label="Filter by urgency"
                  >
                    <span className={styles.groupLabel} aria-hidden="true">
                      <Icon name="alertTriangle" className={styles.groupIcon} />
                      Urgency
                    </span>
                    {URGENCIES.map((level) => (
                      <FilterChip
                        key={level}
                        tone={URGENCY_TONE[level]}
                        selected={urgency === level}
                        onClick={() => setUrgency(urgency === level ? null : level)}
                      >
                        {titleCase(level)}
                      </FilterChip>
                    ))}
                  </div>
                </FilterBar>
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
