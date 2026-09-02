import { useState, type SyntheticEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BLOOD_TYPES,
  CITIES,
  DONATION_INTERVAL_DAYS,
  donorProfilePatchSchema,
  type BloodType,
  type DonorProfilePatchInput,
  type UserRole,
} from '@kapka/shared';
import {
  AppHeader,
  BloodTypeBadge,
  BloodTypeLabel,
  Button,
  Container,
  EmptyState,
  ErrorState,
  Field,
  Icon,
  Input,
  Modal,
  Picker,
  Skeleton,
  useToast,
} from '../components';
import { api, ApiError, type DonorProfile } from '../lib/api';
import { cx } from '../lib/cx';
import { timeAgo } from '../lib/relativeTime';
import { useMe, useMyNotifications } from '../lib/useRequests';
import { useSession } from '../lib/session';
import { PATHS } from './paths';
import styles from './Dashboard.module.css';

const TODAY = new Date().toISOString().slice(0, 10);

/** Said in the reader's terms, not the column's. */
const ACCOUNT_TYPE: Record<UserRole, string> = {
  donor: 'Donor account',
  requester: 'Requester account',
  admin: 'Administrator',
};

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
  const { session, restoring, signOut } = useSession();
  const navigate = useNavigate();
  const token = session?.accessToken;
  const { data, isLoading, error, refetch } = useMe(token);
  const { data: notifications, isLoading: loadingHistory } = useMyNotifications(token);

  /* The server's answer, then whatever this page has changed since. Kept
     locally rather than refetched: the PATCH returns the profile as it now
     stands, so asking again would be a round trip to be told what we hold. */
  const [saved, setSaved] = useState<DonorProfile | null>(null);
  const profile = saved ?? data?.donorProfile ?? null;

  /* The session's copy renders straight away; the query's is the current one.
     They differ exactly when it matters — confirming an email in another tab
     leaves this tab's session saying unconfirmed until the next refresh. */
  const me = data?.user ?? session?.user ?? null;

  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const { show } = useToast();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  const [resending, setResending] = useState(false);

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

  /*
   * Another confirmation link, asked for from the page that shows the address
   * it goes to.
   *
   * Registering signs you in but the matching query refuses an unconfirmed
   * donor, so between those two facts sits somebody who believes they are on
   * the list and is not. The only place that said so was the screen shown
   * once, immediately after registering — gone on the next navigation.
   */
  async function resendConfirmation() {
    if (!token) return;
    setResending(true);
    try {
      const result = await api.resendVerification(token);
      show(
        result.emailVerified
          ? 'That address is already confirmed. You are on the list.'
          : 'Sent. Give it a minute, and check your spam folder.',
        { tone: 'success' },
      );
    } catch (caught) {
      show(
        caught instanceof ApiError
          ? caught.message
          : 'We could not send that email. Try again shortly.',
        { tone: 'error' },
      );
    } finally {
      setResending(false);
    }
  }

  async function download() {
    if (!token) return;
    try {
      const data = await api.exportMyData(token);
      /* Built in the browser from the JSON rather than following a link: the
         endpoint needs an Authorization header, and a plain <a href> cannot
         carry one. */
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `kapka-data-${data.exportedAt.slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      show('Your data has been downloaded.', { tone: 'success' });
    } catch (caught) {
      show(
        caught instanceof ApiError ? caught.message : 'We could not build that file.',
        { tone: 'error' },
      );
    }
  }

  async function deleteAccount() {
    if (!token) return;
    setDeleteError(null);
    setLeaving(true);
    try {
      await api.deleteMyAccount(deletePassword, token);
      setConfirmingDelete(false);
      /* Signed out here rather than left holding a token for an account that
         no longer exists — every subsequent call would 401 and the screen
         would look broken rather than finished. */
      signOut();
      void navigate(PATHS.feed, { replace: true });
    } catch (caught) {
      setDeleteError(
        caught instanceof ApiError ? caught.message : 'We could not delete that.',
      );
    } finally {
      setLeaving(false);
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

  /* Only once the boot refresh has answered: null means "not known yet"
     until then, and telling a signed-in donor to sign in is a worse first
     frame than a moment of nothing. */
  if (restoring) return <AppHeader />;

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
          {/* ── Who you are ────────────────────────────────────────────────
              The heading is the person, not the word "profile": a page about
              you that opens with a category label and finds your name three
              paragraphs down is a settings screen wearing a hat.

              It is also the only place outside the minute after registering
              that can say the address is still unconfirmed — and an
              unconfirmed donor is not in the matching query, however
              complete the rest of this page looks (§12).                   */}
          {me && (
            <header className={styles.identity}>
              <p className={styles.eyebrow}>Your profile</p>

              <div className={styles.identityTop}>
                <span className={styles.identityAvatar} aria-hidden="true">
                  {me.fullName.slice(0, 1).toUpperCase()}
                </span>
                <div className={styles.identityWho}>
                  <h1 className={styles.title}>{me.fullName}</h1>
                  <p className={styles.identityEmail}>{me.email}</p>
                </div>
              </div>

              {/* Never the colour alone: each chip carries its own words, and
                  the pending one carries an icon as well. */}
              <ul className={styles.chips}>
                <li className={styles.chip}>{ACCOUNT_TYPE[me.role]}</li>
                <li
                  className={cx(
                    styles.chip,
                    me.emailVerified ? styles.chipDone : styles.chipPending,
                  )}
                >
                  <Icon name={me.emailVerified ? 'checkCircle' : 'alertCircle'} />
                  {me.emailVerified ? 'Email confirmed' : 'Email not confirmed'}
                </li>
              </ul>

              {!me.emailVerified && (
                <div className={styles.verify}>
                  <p className={styles.verifyLine}>
                    Until you open the link we sent to {me.email}, no request will ever
                    reach you — a donor we cannot confirm is left out of the matching.
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void resendConfirmation()}
                    loading={resending}
                    loadingLabel="Sending a new link…"
                  >
                    Send the link again
                  </Button>
                </div>
              )}

              {/* The two facts that decide which requests are yours, where
                  somebody looks first. Two and not three: whether the emails
                  are on is the whole subject of the card directly below, and
                  a summary that repeats the thing under it is noise. Changing
                  either is further down, where the consequence is explained.
                  Both are also side by side at 360px rather than two-and-one,
                  which is what a third would cost here. */}
              {profile && (
                <dl className={styles.facts}>
                  <div className={styles.fact}>
                    <dt>Blood type</dt>
                    <dd>
                      <BloodTypeBadge type={profile.bloodType} />
                    </dd>
                  </div>
                  <div className={styles.fact}>
                    <dt>City</dt>
                    <dd className={styles.factText}>{profile.city}</dd>
                  </div>
                </dl>
              )}
            </header>
          )}

          {isLoading && (
            /* Two cards, shaped like the two that arrive — a heading, a line
               of body, and the action that sits under it. */
            <div className={styles.grid} aria-hidden="true">
              {Array.from({ length: 2 }, (_, i) => (
                <section key={i} className={styles.card}>
                  <Skeleton width="55%" height="1.4rem" />
                  <div className={styles.cardBody}>
                    <Skeleton width="100%" shape="text" />
                  </div>
                  <div className={styles.cardActions}>
                    <Skeleton width="9rem" height="2.75rem" />
                  </div>
                </section>
              ))}
            </div>
          )}

          {error && (
            <ErrorState error={error} subject="your settings" onRetry={refetch} />
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
                      <Picker
                        placeholder="Choose your city"
                        icon="mapPin"
                        options={CITIES}
                        value={city}
                        onChange={setCity}
                      />
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
              {/* ── What we have sent ─────────────────────────────────────
                  §9.5. A donor asked to give blood by an automated system is
                  owed a plain answer to "what have you sent me". The delivery
                  status is here rather than tidied away: a queued row is one
                  the free-tier ceiling held back (§5.3) and a failed one
                  never arrived, and calling either of them sent would be a
                  list of emails they never got.                             */}
              {/* Addressable: the bell in the header points at this. */}
              <section id="notifications" className={cx(styles.card, styles.cardWide)}>
                <h2 className={styles.cardTitle}>What we have emailed you about</h2>

                {loadingHistory && (
                  /* Shaped like a history row: a hospital name over a line of
                     meta, with the same rule between them. */
                  <ul className={styles.history} aria-hidden="true">
                    {Array.from({ length: 2 }, (_, i) => (
                      <li key={i} className={styles.historyRow}>
                        <div className={styles.historyMain}>
                          <Skeleton width="9rem" height="1.2rem" />
                          <div className={styles.historyMeta}>
                            <Skeleton width="12rem" shape="text" />
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {!loadingHistory && notifications?.length === 0 && (
                  <p className={styles.cardBody}>
                    Nothing yet. When an admin approves a request your blood type can help
                    with in {profile.city}, it will appear here — and in your inbox.
                  </p>
                )}

                {notifications && notifications.length > 0 && (
                  <ul className={styles.history}>
                    {notifications.map((row) => (
                      <li key={row.requestId} className={styles.historyRow}>
                        <div className={styles.historyMain}>
                          <Link
                            to={PATHS.request(row.requestId)}
                            className={styles.historyLink}
                          >
                            {row.hospitalName}
                          </Link>
                          <p className={styles.historyMeta}>
                            <BloodTypeLabel type={row.bloodType} /> · {row.city} ·{' '}
                            <time dateTime={row.createdAt}>{timeAgo(row.createdAt)}</time>
                          </p>
                        </div>
                        <div className={styles.historyTags}>
                          {row.status !== 'sent' && (
                            <span className={styles.historyWarn}>
                              {row.status === 'queued'
                                ? 'Queued — not sent yet'
                                : 'We could not reach you'}
                            </span>
                          )}
                          {row.requestStatus !== 'approved' && (
                            <span className={styles.historyState}>
                              {row.requestStatus === 'fulfilled'
                                ? 'Fulfilled'
                                : row.requestStatus === 'expired'
                                  ? 'Expired'
                                  : 'Closed'}
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              {/* ── Your data ─────────────────────────────────────────────
                  §12: a donor may take their data and may leave. Both live
                  at the bottom, away from the switches somebody uses often,
                  and one of them cannot be undone.                          */}
              <section className={cx(styles.card, styles.cardWide)}>
                <h2 className={styles.cardTitle}>Your data</h2>
                <p className={styles.cardBody}>
                  Everything we hold about you — your account, your details, the requests
                  you have posted and every email we have sent you.
                </p>
                <div className={styles.cardActions}>
                  <Button variant="secondary" onClick={() => void download()}>
                    <Icon name="arrowRight" />
                    Download my data
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmingDelete(true)}>
                    Delete my account
                  </Button>
                </div>
              </section>
            </div>
          )}

          <Modal
            open={confirmingDelete}
            onClose={() => {
              setConfirmingDelete(false);
              setDeletePassword('');
              setDeleteError(null);
            }}
            title="Delete your account?"
            footer={
              <>
                <Button
                  variant="danger"
                  onClick={() => void deleteAccount()}
                  loading={leaving}
                  loadingLabel="Deleting…"
                >
                  Delete everything
                </Button>
                <Button variant="ghost" onClick={() => setConfirmingDelete(false)}>
                  Keep my account
                </Button>
              </>
            }
          >
            <p className={styles.cardBody}>
              This removes your account, your donor details and any requests you have
              posted, along with the phone number on them. It cannot be undone.
            </p>
            <p className={styles.cardBody}>
              The record that we emailed you about a request stays, with your name taken
              off it — otherwise the daily email count would read low and donors who are
              still here would stop being reached.
            </p>

            <Field
              label="Your password"
              required
              error={deleteError ?? undefined}
              help="Asked again because this cannot be undone."
            >
              <Input
                type="password"
                autoComplete="current-password"
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
              />
            </Field>
          </Modal>

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
