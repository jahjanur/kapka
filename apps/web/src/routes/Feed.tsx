import { useEffect, useMemo, useState } from 'react';
import {
  AppHeader,
  BloodTypeBadge,
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
  RequestCard,
  RequestCardSkeleton,
  Select,
  Stack,
  UrgencyPill,
} from '../components';
import { BLOOD_TYPES, CITIES, type BloodType, type Urgency } from '@kapka/shared';
import { useRequests } from '../lib/useRequests';
import { useSession } from '../lib/session';
import { timeAgo } from '../lib/relativeTime';
import { PATHS } from './paths';
import styles from './Feed.module.css';

const URGENCIES: Urgency[] = ['critical', 'urgent', 'routine'];
const URGENCY_RANK: Record<Urgency, number> = { critical: 0, urgent: 1, routine: 2 };

const titleCase = (value: string) => (value[0] ?? '').toUpperCase() + value.slice(1);

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

  /** The one the hero calls out on a wide screen. */
  const mostUrgent = filtered[0];

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

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className={styles.hero}>
        <Container>
          <div className={styles.heroGrid}>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}>
                <span className={styles.pulse} aria-hidden="true" />
                Live in North Macedonia
              </p>
              <h1 className={styles.heroTitle}>Someone nearby needs blood.</h1>
              <p className={styles.heroLead}>
                Register once with your blood type and city. When a matching request is
                approved, we email you — no searching, no phone tree.
              </p>
              <div className={styles.heroActions}>
                {/* Read on the session as it stands rather than waiting for
                    the boot refresh: signed out is both the common case and
                    what the header assumes, so the pair of buttons is stable
                    for most readers instead of appearing a moment late. */}
                {heroPrimary && (
                  <Button to={heroPrimary.to} size="lg">
                    {heroPrimary.label}
                  </Button>
                )}
                {/* The hero speaks to donors, but the person whose relative
                    needs blood lands here too, and the header nav that would
                    take them on is hidden on a phone. It leads when there is
                    nothing above it. */}
                <Button
                  to={PATHS.postRequest}
                  variant={heroPrimary ? 'ghost' : 'primary'}
                  size="lg"
                >
                  Post a request
                  <Icon name="arrowRight" />
                </Button>
              </div>

              <dl className={styles.stats}>
                <div className={styles.stat}>
                  <dt>Open requests</dt>
                  <dd data-numeric>{isLoading ? '—' : stats.open}</dd>
                </div>
                <div className={styles.stat}>
                  <dt>Critical</dt>
                  <dd data-numeric>{isLoading ? '—' : stats.critical}</dd>
                </div>
                <div className={styles.stat}>
                  <dt>Cities</dt>
                  <dd data-numeric>{isLoading ? '—' : stats.cities}</dd>
                </div>
              </dl>
            </div>

            {/*
              The wide-screen half of the hero. On a phone this is hidden
              rather than stacked: it repeats the first card of the feed, and
              showing the same request twice in the first two screens is worse
              than showing it once.
            */}
            {mostUrgent && (
              <aside className={styles.spotlight} aria-labelledby="spotlight-heading">
                <h2 id="spotlight-heading" className={styles.spotlightHeading}>
                  Most urgent right now
                </h2>
                <div className={styles.spotlightTop}>
                  <BloodTypeBadge type={mostUrgent.bloodType} size="lg" />
                  <UrgencyPill urgency={mostUrgent.urgency} />
                </div>
                <p className={styles.spotlightHospital}>{mostUrgent.hospitalName}</p>
                <p className={styles.spotlightMeta}>
                  {mostUrgent.city} · {mostUrgent.unitsNeeded}
                  {mostUrgent.unitsNeeded === 1 ? ' unit' : ' units'} ·{' '}
                  {timeAgo(mostUrgent.createdAt)}
                </p>
                <Button to={PATHS.request(mostUrgent.id)} variant="secondary" fullWidth>
                  View request
                  <Icon name="chevronRight" />
                </Button>
              </aside>
            )}
          </div>
        </Container>
      </section>

      {/* ── Filters and list ───────────────────────────────────────────────
          One grid holds both, so the filters can be a strip above the cards
          on a phone and a column beside them on a wide screen without the
          markup changing. Sticky in both places, from the same rule.       */}
      <div className={styles.page}>
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
                  <Select
                    placeholder="Anywhere"
                    value={city}
                    onChange={(event) => setCity(event.target.value)}
                  >
                    {CITIES.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </Select>
                </Field>

                {activeFilters > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    <Icon name="close" />
                    Clear
                  </Button>
                )}
              </div>
            </aside>

            <div className={styles.list}>
              <Stack gap={4}>
                {/* The list needs a heading of its own. The spotlight above
                    is the only h2 on this page and it is hidden on a phone,
                    so the outline went straight from the h1 to the cards'
                    h3s — a skipped level, and nothing for a screen reader to
                    jump to when the thing it wants is "the requests". */}
                <h2 className="visually-hidden">Requests</h2>
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
            </div>
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
