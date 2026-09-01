import { useEffect, useMemo, useState } from 'react';
import {
  AppHeader,
  BloodTypeBadge,
  BloodTypeLabel,
  Button,
  Container,
  EmptyState,
  Field,
  FilterChip,
  Grid,
  Icon,
  RequestCard,
  Select,
  Skeleton,
  Stack,
  UrgencyPill,
} from '../components';
import { BLOOD_TYPES, CITIES, type BloodType, type Urgency } from '@kapka/shared';
import { useRequests } from '../lib/useRequests';
import { timeAgo } from '../lib/relativeTime';
import { PATHS } from './paths';
import styles from './Feed.module.css';

const URGENCIES: Urgency[] = ['critical', 'urgent', 'routine'];
const URGENCY_RANK: Record<Urgency, number> = { critical: 0, urgent: 1, routine: 2 };

const titleCase = (value: string) => (value[0] ?? '').toUpperCase() + value.slice(1);

/** Shape-matched to RequestCard, so nothing jumps when the data arrives. */
function SkeletonCard() {
  return (
    <div className={styles.skeletonCard}>
      <div className={styles.skeletonTop}>
        <Skeleton width="4rem" height="2.25rem" shape="circle" />
        <Skeleton width="5.5rem" height="1.75rem" shape="circle" />
      </div>
      <Stack gap={2}>
        <Skeleton width="80%" height="1.4rem" />
        <Skeleton width="60%" height="1rem" />
      </Stack>
      <Skeleton width="9rem" height="2.5rem" />
    </div>
  );
}

export default function Feed() {
  const { data, isLoading, error, refetch } = useRequests();

  const [urgency, setUrgency] = useState<Urgency | null>(null);
  const [bloodType, setBloodType] = useState<BloodType | null>(null);
  const [city, setCity] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
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
                <Button to={PATHS.register} size="lg">
                  Register as donor
                </Button>
                {/* The hero speaks to donors, but the person whose relative
                    needs blood lands here too, and the header nav that would
                    take them on is hidden on a phone. */}
                <Button to={PATHS.postRequest} variant="ghost" size="lg">
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

      {/* ── Filter toolbar ────────────────────────────────────────────────── */}
      <div className={styles.toolbar}>
        <Container>
          <div className={styles.toolbarInner}>
            <button
              type="button"
              className={styles.filterToggle}
              aria-expanded={filtersOpen}
              aria-controls="filter-panel"
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <Icon name="filter" />
              Filters
              {activeFilters > 0 && (
                <span className={styles.filterCount} data-numeric>
                  {activeFilters}
                </span>
              )}
              <Icon name="chevronDown" className={styles.filterChevron} />
            </button>

            <div
              id="filter-panel"
              className={`${styles.panel} ${filtersOpen ? styles.panelOpen : ''}`}
            >
              <div className={styles.group} role="group" aria-label="Filter by urgency">
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

              <div className={styles.divider} aria-hidden="true" />

              <div
                className={styles.group}
                role="group"
                aria-label="Filter by blood type"
              >
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

              <div className={styles.cityField}>
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
              </div>

              {activeFilters > 0 && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <Icon name="close" />
                  Clear
                </Button>
              )}
            </div>
          </div>
        </Container>
      </div>

      {/* ── The list ──────────────────────────────────────────────────────── */}
      <div className={styles.page}>
        <Container>
          <Stack gap={4}>
            <p className={styles.resultCount} aria-live="polite">
              {isLoading
                ? 'Loading requests…'
                : `${filtered.length} open ${filtered.length === 1 ? 'request' : 'requests'}`}
            </p>

            {isLoading && (
              <Grid minColumn="19rem" gap={4}>
                {Array.from({ length: 6 }, (_, index) => (
                  <SkeletonCard key={index} />
                ))}
              </Grid>
            )}

            {error && (
              <EmptyState
                icon="alertTriangle"
                headline="We couldn’t load the requests"
                body="The connection dropped on the way. Nothing is lost — try again."
                action={<Button onClick={refetch}>Try again</Button>}
              />
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
                  body="That is good news. Register as a donor and we will email you the moment someone with your blood type needs help."
                  action={<Button to={PATHS.register}>Register as donor</Button>}
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
        </Container>
      </div>

      {/* Thumb zone: the primary action follows you down the page on a phone. */}
      <div className={`${styles.mobileCta} ${scrolled ? styles.mobileCtaVisible : ''}`}>
        <Button to={PATHS.register} fullWidth size="lg">
          Register as donor
        </Button>
      </div>
    </>
  );
}
