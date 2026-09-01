import { useState, type SyntheticEvent } from 'react';
import {
  BLOOD_TYPES,
  CITIES,
  DONATION_INTERVAL_DAYS,
  donorProfilePatchSchema,
  type BloodType,
  type DonorProfilePatchInput,
} from '@kapka/shared';
import {
  AppHeader,
  BloodTypeLabel,
  Button,
  Container,
  EmptyState,
  Field,
  Icon,
  Input,
  Select,
  Skeleton,
} from '../components';
import { api, ApiError, type DonorProfile } from '../lib/api';
import { cx } from '../lib/cx';
import { useMe } from '../lib/useRequests';
import { useSession } from '../lib/session';
import { PATHS } from './paths';
import styles from './Dashboard.module.css';

const TODAY = new Date().toISOString().slice(0, 10);

/**
 * A day, written out. Accepts a bare YYYY-MM-DD, which Date parses as UTC
 * midnight and would otherwise format as the day before west of Greenwich.
 */
const longDate = (day: string) =>
  new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

/** The donor's own dashboard (§9.5). */
export default function Dashboard() {
  const { session } = useSession();
  const token = session?.accessToken;
  const { data, isLoading, error, refetch } = useMe(token);

  /* The server's answer, then whatever this page has changed since. Kept
     locally rather than refetched: the PATCH returns the profile as it now
     stands, so asking again would be a round trip to be told what we hold. */
  const [saved, setSaved] = useState<DonorProfile | null>(null);
  const profile = saved ?? data?.donorProfile ?? null;

  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [bloodType, setBloodType] = useState<BloodType | null>(null);
  const [city, setCity] = useState('');
  const [neverDonated, setNeverDonated] = useState(false);
  const [lastDonationDate, setLastDonationDate] = useState('');

  async function save(patch: DonorProfilePatchInput, message: string) {
    if (!token) return;
    setFormError(null);
    setBusy(true);
    try {
      setSaved(await api.updateDonorProfile(patch, token));
      setNote(message);
      setEditing(false);
    } catch (caught) {
      setFormError(
        caught instanceof ApiError ? caught.message : 'That did not save. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  function startEditing(current: DonorProfile) {
    setBloodType(current.bloodType);
    setCity(current.city);
    setNeverDonated(current.lastDonationDate === null);
    setLastDonationDate(current.lastDonationDate ?? '');
    setFormError(null);
    setEditing(true);
  }

  function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    const candidate = {
      bloodType,
      city,
      lastDonationDate: neverDonated ? null : lastDonationDate,
    };
    // The same schema the API validates with, so the two cannot disagree.
    const parsed = donorProfilePatchSchema.safeParse(candidate);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Check the form and try again.');
      return;
    }
    void save(parsed.data, 'Your details are saved.');
  }

  if (!session) {
    return (
      <>
        <AppHeader />
        <div className={styles.page}>
          <Container>
            <EmptyState
              icon="alertCircle"
              headline="Sign in to see your donor settings"
              body="Your blood type, your city and whether we email you all live behind your account."
              action={
                <Button to={PATHS.register} size="lg">
                  Register as donor
                </Button>
              }
            />
          </Container>
        </div>
      </>
    );
  }

  return (
    <>
      <AppHeader />
      <div className={styles.page}>
        <Container>
          <div className={styles.head}>
            <h1 className={styles.title}>Your donor settings</h1>
            <p className={styles.lead}>
              What we use to decide whether a request reaches you, and the switch that
              stops it.
            </p>
          </div>

          {isLoading && (
            <div className={styles.skeletons}>
              <Skeleton width="100%" height="7rem" />
              <Skeleton width="100%" height="10rem" />
            </div>
          )}

          {error && (
            <EmptyState
              icon="alertTriangle"
              headline="We couldn’t load your settings"
              body="The connection dropped on the way. Nothing is lost — try again."
              action={<Button onClick={refetch}>Try again</Button>}
            />
          )}

          {!isLoading && !error && !profile && (
            <EmptyState
              icon="info"
              headline="This account is not a donor"
              body="Only donor accounts have a blood type and a city on file. Nothing here applies to you."
              action={<Button to={PATHS.feed}>See open requests</Button>}
            />
          )}

          {profile && (
            <div className={styles.grid}>
              {/* ── Eligibility ───────────────────────────────────────────
                  The one question a donor opens this page to ask. The date
                  comes from the API, which computes it in SQL — a browser
                  doing this arithmetic is how a timezone decides who may
                  give (§5.2).                                              */}
              <section
                className={cx(
                  styles.card,
                  profile.eligibleFrom ? styles.cardWaiting : styles.cardReady,
                )}
              >
                <span className={styles.cardMark} aria-hidden="true">
                  <Icon name={profile.eligibleFrom ? 'clock' : 'checkCircle'} />
                </span>
                <h2 className={styles.cardTitle}>
                  {profile.eligibleFrom
                    ? 'You cannot give just yet'
                    : 'You can give today'}
                </h2>
                <p className={styles.cardBody}>
                  {profile.eligibleFrom ? (
                    <>
                      Your last donation was{' '}
                      {profile.lastDonationDate ? (
                        <time dateTime={profile.lastDonationDate}>
                          {longDate(profile.lastDonationDate)}
                        </time>
                      ) : (
                        'recorded'
                      )}
                      . You are eligible again on{' '}
                      <time dateTime={profile.eligibleFrom}>
                        {longDate(profile.eligibleFrom)}
                      </time>
                      , {DONATION_INTERVAL_DAYS} days after giving.
                    </>
                  ) : (
                    <>
                      Nothing is holding you back. We will email you when a matching
                      request in {profile.city} is approved.
                    </>
                  )}
                </p>
              </section>

              {/* ── The pause switch ──────────────────────────────────────
                  §3: without this, stopping the emails means deleting the
                  account. Paused is a state to come back from, not an exit. */}
              <section className={styles.card}>
                <h2 className={styles.cardTitle}>
                  {profile.isAvailable ? 'You are on the list' : 'Your emails are paused'}
                </h2>
                <p className={styles.cardBody}>
                  {profile.isAvailable
                    ? 'You will be emailed when someone near you needs your blood type. Pause it any time — nothing is deleted and you keep your account.'
                    : 'We are not emailing you about anything. Your account and your details are untouched; turn this back on whenever you are ready.'}
                </p>
                <div className={styles.cardActions}>
                  <Button
                    variant={profile.isAvailable ? 'secondary' : 'primary'}
                    onClick={() =>
                      void save(
                        { isAvailable: !profile.isAvailable },
                        profile.isAvailable
                          ? 'Paused. We will not email you until you turn this back on.'
                          : 'You are back on the list.',
                      )
                    }
                    loading={busy}
                    loadingLabel="Saving…"
                  >
                    {profile.isAvailable ? 'Pause my emails' : 'Start emailing me again'}
                  </Button>
                </div>
              </section>

              {/* ── Profile ───────────────────────────────────────────── */}
              <section className={cx(styles.card, styles.cardWide)}>
                <h2 className={styles.cardTitle}>Your details</h2>

                {formError && (
                  <p className={styles.formError} role="alert">
                    <Icon name="alertCircle" />
                    {formError}
                  </p>
                )}

                {editing ? (
                  <form className={styles.form} onSubmit={handleSubmit} noValidate>
                    <Field
                      label="Blood type"
                      required
                      help="Only change this if it was entered wrongly — it decides every request you hear about."
                    >
                      <div className={styles.types} role="group" aria-label="Blood type">
                        {BLOOD_TYPES.map((type) => (
                          <button
                            key={type}
                            type="button"
                            className={cx(
                              styles.typeButton,
                              bloodType === type && styles.typeButtonOn,
                            )}
                            aria-pressed={bloodType === type}
                            onClick={() => setBloodType(type)}
                          >
                            <BloodTypeLabel type={type} />
                          </button>
                        ))}
                      </div>
                    </Field>

                    <Field label="City" required help="We match requests in your city.">
                      <Select
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

                    <fieldset className={styles.fieldset}>
                      <legend className={styles.legend}>Last donation</legend>
                      <label className={styles.check}>
                        <input
                          type="checkbox"
                          checked={neverDonated}
                          onChange={(event) => setNeverDonated(event.target.checked)}
                        />
                        I have never donated
                      </label>
                      {!neverDonated && (
                        <Field label="Date of last donation">
                          <Input
                            type="date"
                            max={TODAY}
                            value={lastDonationDate}
                            onChange={(event) => setLastDonationDate(event.target.value)}
                          />
                        </Field>
                      )}
                    </fieldset>

                    <div className={styles.cardActions}>
                      <Button type="submit" loading={busy} loadingLabel="Saving…">
                        Save changes
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setEditing(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : (
                  <>
                    <dl className={styles.facts}>
                      <div>
                        <dt>Blood type</dt>
                        <dd>
                          <BloodTypeLabel type={profile.bloodType} />
                        </dd>
                      </div>
                      <div>
                        <dt>City</dt>
                        <dd>{profile.city}</dd>
                      </div>
                      <div>
                        <dt>Last donation</dt>
                        <dd>
                          {profile.lastDonationDate ? (
                            <time dateTime={profile.lastDonationDate}>
                              {longDate(profile.lastDonationDate)}
                            </time>
                          ) : (
                            'Never donated'
                          )}
                        </dd>
                      </div>
                    </dl>
                    <div className={styles.cardActions}>
                      <Button variant="secondary" onClick={() => startEditing(profile)}>
                        Edit details
                      </Button>
                    </div>
                  </>
                )}
              </section>
            </div>
          )}

          {note && (
            <p className={styles.note} role="status">
              <Icon name="checkCircle" />
              {note}
            </p>
          )}
        </Container>
      </div>
    </>
  );
}
