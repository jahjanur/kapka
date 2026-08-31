import { useEffect, useMemo, useState } from 'react';
import {
  AppHeader,
  Button,
  Container,
  EmptyState,
  Field,
  FilterBar,
  FilterChip,
  FilterGroupLabel,
  Grid,
  Icon,
  IconSprite,
  RequestCard,
  Select,
  Skeleton,
  Stack,
  WithSidebar,
} from '../components';
import {
  BLOOD_TYPES,
  CITIES,
  formatBloodType,
  type BloodType,
  type Urgency,
} from '@kapka/shared';
import { useRequests } from '../lib/useRequests';
import styles from './Feed.module.css';

const URGENCIES: Urgency[] = ['critical', 'urgent', 'routine'];

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
      <Skeleton width="9rem" height="2.75rem" />
    </div>
  );
}

export default function Feed() {
  const { data, isLoading, error, refetch } = useRequests();

  const [urgency, setUrgency] = useState<Urgency | null>(null);
  const [bloodType, setBloodType] = useState<BloodType | null>(null);
  const [city, setCity] = useState('');
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 240);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const filtered = useMemo(
    () =>
      (data ?? []).filter(
        (request) =>
          (!urgency || request.urgency === urgency) &&
          (!bloodType || request.bloodType === bloodType) &&
          (!city || request.city === city),
      ),
    [data, urgency, bloodType, city],
  );

  const hasFilters = urgency !== null || bloodType !== null || city !== '';
  const clearFilters = () => {
    setUrgency(null);
    setBloodType(null);
    setCity('');
  };

  const filters = (
    <div className={styles.filters}>
      <Stack gap={3} className={styles.filterStack}>
        <FilterBar label="Filter by urgency">
          <FilterGroupLabel>Urgency</FilterGroupLabel>
          {URGENCIES.map((level) => (
            <FilterChip
              key={level}
              selected={urgency === level}
              onClick={() => setUrgency(urgency === level ? null : level)}
            >
              {level[0]?.toUpperCase()}
              {level.slice(1)}
            </FilterChip>
          ))}
        </FilterBar>

        <FilterBar label="Filter by blood type">
          <FilterGroupLabel>Type</FilterGroupLabel>
          {BLOOD_TYPES.map((type) => (
            <FilterChip
              key={type}
              selected={bloodType === type}
              onClick={() => setBloodType(bloodType === type ? null : type)}
            >
              {formatBloodType(type)}
            </FilterChip>
          ))}
        </FilterBar>

        <div className={styles.cityField}>
          <Field label="City">
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

        {hasFilters && (
          <div>
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <Icon name="close" />
              Clear filters
            </Button>
          </div>
        )}
      </Stack>
    </div>
  );

  return (
    <>
      <IconSprite />
      <AppHeader />

      <div className={styles.page}>
        <Container>
          {/* Above the fold on a phone: what this is, and one action. */}
          <div className={styles.hero}>
            <h1 className={styles.heroTitle}>Someone nearby needs blood.</h1>
            <p className={styles.heroLead}>
              Register once with your blood type and city. When a matching request is
              approved, we email you — no searching, no phone tree.
            </p>
            <div className={styles.heroActions}>
              <Button size="lg">Register as donor</Button>
            </div>
          </div>

          <WithSidebar sidebar={filters} sidebarWidth="16rem" mainMin="30rem" gap={8}>
            <Stack gap={4}>
              <p className={styles.resultCount} aria-live="polite">
                {isLoading
                  ? 'Loading requests…'
                  : `${filtered.length} open ${filtered.length === 1 ? 'request' : 'requests'}`}
              </p>

              {isLoading && (
                <Grid minColumn="24rem" gap={4}>
                  {Array.from({ length: 4 }, (_, index) => (
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
                (hasFilters ? (
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
                    action={<Button>Register as donor</Button>}
                  />
                ))}

              {!isLoading && !error && filtered.length > 0 && (
                <Grid minColumn="24rem" gap={4}>
                  {filtered.map((request) => (
                    <RequestCard key={request.id} request={request} />
                  ))}
                </Grid>
              )}
            </Stack>
          </WithSidebar>
        </Container>
      </div>

      {/* Thumb zone: the primary action follows you down the page on a phone. */}
      <div className={`${styles.mobileCta} ${scrolled ? styles.mobileCtaVisible : ''}`}>
        <Button fullWidth size="lg">
          Register as donor
        </Button>
      </div>
    </>
  );
}
