import { useEffect, useState, type CSSProperties, type SyntheticEvent } from 'react';
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
  AvatarPicker,
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
  type IconName,
} from '../components';
import { api, ApiError, type DonorProfile } from '../lib/api';
import { resolveDonorStatus, type DonorStatusKind } from '../lib/donorStatus';
import { DonationMark } from './DonationMark';
import { cx } from '../lib/cx';
import { timeAgo } from '../lib/relativeTime';
import { useMe, useMyNotifications } from '../lib/useRequests';
import { useSession } from '../lib/session';
import { PATHS } from './paths';
import styles from './Dashboard.module.css';

/* Recomputed per render rather than frozen at module load: a tab left open
   overnight kept yesterday's date as the maximum. */
const today = () => new Date().toISOString().slice(0, 10);

/** How long a confirmation stays on screen before it stops being news. */
const NOTE_MS = 6000;

/**
 * What each status says, and how loudly.
 *
 * One table, so the four states are written next to each other and cannot
 * drift apart the way three separate branches did. Tone is meaning, not
 * decoration: amber is the one that blocks, green the one that is clear, and
 * the two in between are neutral because neither is wrong — one is a choice
 * and the other is a wait.
 */
const STATUS: Record<
  DonorStatusKind,
  {
    tone: 'blocked' | 'paused' | 'waiting' | 'ready';
    icon: IconName;
    title: string;
    body: string;
  }
> = {
  needs_email_confirmation: {
    tone: 'blocked',
    icon: 'alertCircle',
    title: 'Confirm your email to be matched',
    body: 'Until you open the link we sent you, no request will reach you — a donor we cannot confirm is left out of the matching.',
  },
  paused: {
    tone: 'paused',
    icon: 'eyeOff',
    title: 'Your emails are paused',
    body: 'Nothing is being sent to you. Your account and your details are untouched.',
  },
  cooling_down: {
    tone: 'waiting',
    icon: 'clock',
    title: 'You cannot give just yet',
    body: '',
  },
  eligible: {
    tone: 'ready',
    icon: 'checkCircle',
    title: 'You can give today',
    body: 'We will email you when a matching request near you is approved.',
  },
};

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

  /* Exactly one status, from one resolver, mirroring the five conditions the
     matching query applies. Null only while there is nothing to resolve from,
     and the space it will occupy is reserved either way. */
  const status = me && profile ? resolveDonorStatus(me, profile) : null;

  /* One switch, both flags. The query requires both, so anything less is a
     donor who is half on the list. */
  const emailsOn = profile ? profile.isAvailable && profile.notifyByEmail : false;

  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  /* Announced, then taken down. It used to be set and never cleared — no
     timer, no reset — so one successful save left a green bar at the foot of
     the page for the rest of the session, including underneath a later red
     error saying the opposite. */
  useEffect(() => {
    if (note === null) return;
    const timer = setTimeout(() => setNote(null), NOTE_MS);
    return () => clearTimeout(timer);
  }, [note]);

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
      /* If the address turns out to be confirmed already — done in another
         tab, usually — the status on this page is out of date and saying so
         in a toast while the block below still says the opposite is how the
         contradiction gets back in. Ask again instead. */
      if (result.emailVerified) refetch();
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
          {/* ══ 1. Identity and status ═══════════════════════════════════
              One block, one elevation, and the only raised surface on the
              page. Who you are and whether a request can reach you are the
              two things somebody opens this page for, so they are the two
              things above the fold and nothing else competes for that
              weight.

              The status inside it is exactly one element, from one resolver.
              It used to be three independent branches, which is how an amber
              "no request will ever reach you" came to sit above a green
              "nothing is holding you back".                                */}
          {me && (
            <header className={styles.identity} style={{ '--tier': 0 } as CSSProperties}>
              <div className={styles.identityRow}>
                <AvatarPicker
                  compact
                  initial={me.fullName.slice(0, 1).toUpperCase()}
                  accessToken={session.accessToken}
                />
                <div className={styles.identityWho}>
                  <h1 className={styles.title}>{me.fullName}</h1>
                  {/* The address, once. It used to be printed again inside
                      the warning below, a few pixels away. */}
                  <p className={styles.identityEmail}>{me.email}</p>
                  <p className={styles.identityRole}>{ACCOUNT_TYPE[me.role]}</p>
                </div>
              </div>

              {/* The space is held whether or not the answer has arrived, so
                  nothing below it moves when it does. */}
              <div className={styles.statusSlot}>
                {status && (
                  <div
                    className={styles.status}
                    data-tone={STATUS[status.kind].tone}
                    role="status"
                  >
                    <span className={styles.statusMark} aria-hidden="true">
                      <Icon name={STATUS[status.kind].icon} />
                    </span>
                    <div className={styles.statusText}>
                      <p className={styles.statusTitle}>{STATUS[status.kind].title}</p>
                      <p className={styles.statusBody}>
                        {status.kind === 'cooling_down' && status.eligibleFrom ? (
                          <>
                            You can give again on{' '}
                            <time dateTime={status.eligibleFrom}>
                              {longDate(status.eligibleFrom)}
                            </time>
                            , {DONATION_INTERVAL_DAYS} days after your last donation.
                          </>
                        ) : (
                          STATUS[status.kind].body
                        )}
                      </p>
                    </div>
                    {/* The one blocking state is the only one with an action,
                        and it is the most prominent button on the page. */}
                    {status.kind === 'needs_email_confirmation' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void resendConfirmation()}
                        loading={resending}
                        loadingLabel="Sending a new link…"
                        className={styles.statusAction}
                      >
                        Resend confirmation link
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </header>
          )}

          {isLoading && !profile && (
            <div className={styles.sections} aria-hidden="true">
              <section className={styles.section}>
                <Skeleton width="9rem" height="1.4rem" />
                <Skeleton width="100%" height="6rem" />
              </section>
            </div>
          )}

          {error && (
            <div className={styles.state}>
              <ErrorState error={error} subject="your settings" onRetry={refetch} />
            </div>
          )}

          {!isLoading && !error && !profile && (
            <div className={styles.state}>
              <EmptyState
                icon="alertCircle"
                headline="This account is not a donor"
                body="Only donor accounts have a blood type and a city on file. Nothing here applies to you."
                action={<Button to={PATHS.createAccount}>Become a donor</Button>}
              />
            </div>
          )}

          {profile && (
            <>
              <div className={styles.sections}>
                {/* ══ 2. Your details ═════════════════════════════════════════
                  The single home for these three values. They used to be
                  printed here and again in the header, in two different
                  visual treatments.                                        */}
                <section
                  className={styles.section}
                  style={{ '--tier': 1 } as CSSProperties}
                >
                  <div className={styles.sectionHead}>
                    <h2 className={styles.sectionTitle}>Your details</h2>
                    {!editing && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => startEditing(profile)}
                      >
                        Edit details
                      </Button>
                    )}
                  </div>

                  {formError && (
                    <p className={styles.formError} role="alert">
                      <Icon name="alertCircle" />
                      {formError}
                    </p>
                  )}

                  {editing ? (
                    <form onSubmit={handleSubmit} noValidate>
                      <Field
                        label="Blood type"
                        required
                        help="Only change this if it was entered wrongly — it decides every request you hear about."
                      >
                        <div
                          className={styles.types}
                          role="group"
                          aria-label="Blood type"
                        >
                          {BLOOD_TYPES.map((type) => (
                            <button
                              key={type}
                              type="button"
                              aria-pressed={bloodType === type}
                              className={cx(
                                styles.typeButton,
                                bloodType === type && styles.typeButtonOn,
                              )}
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
                              max={today()}
                              value={lastDonationDate}
                              onChange={(event) =>
                                setLastDonationDate(event.target.value)
                              }
                            />
                          </Field>
                        )}
                      </fieldset>

                      <div className={styles.formActions}>
                        <Button type="submit" loading={busy} loadingLabel="Saving…">
                          Save changes
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            setEditing(false);
                            setFormError(null);
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <dl className={styles.details}>
                      <div className={styles.detail}>
                        <dt>
                          <Icon name="droplet" aria-hidden="true" />
                          Blood type
                        </dt>
                        <dd>
                          <BloodTypeBadge type={profile.bloodType} />
                        </dd>
                      </div>
                      <div className={styles.detail}>
                        <dt>
                          <Icon name="mapPin" aria-hidden="true" />
                          City
                        </dt>
                        <dd>{profile.city}</dd>
                      </div>
                      <div className={styles.detail}>
                        <dt>
                          <Icon name="calendar" aria-hidden="true" />
                          Last donation
                        </dt>
                        <dd>
                          {profile.lastDonationDate ? (
                            <time dateTime={profile.lastDonationDate}>
                              {longDate(profile.lastDonationDate)}
                            </time>
                          ) : (
                            'Never donated'
                          )}
                          {/* Derived, so nobody counts 56 days themselves. It
                            lived only inside the eligibility card before, so
                            the details list made you do the arithmetic. */}
                          {profile.eligibleFrom && (
                            <span className={styles.detailNote}>
                              Eligible again{' '}
                              <time dateTime={profile.eligibleFrom}>
                                {longDate(profile.eligibleFrom)}
                              </time>
                            </span>
                          )}
                        </dd>
                      </div>
                    </dl>
                  )}
                </section>

                {/* ══ 3. Matching ═════════════════════════════════════════════
                  One section for the subscription: what it does, its switch,
                  and what it has sent. This was three cards — an account-type
                  chip, "You are on the list", and the history — each
                  describing a different face of the same thing.            */}
                <section
                  className={styles.section}
                  style={{ '--tier': 2 } as CSSProperties}
                >
                  <div className={styles.sectionHead}>
                    <h2 className={styles.sectionTitle}>Matching</h2>
                    {/* A switch showing a state, not a button naming an action.
                      "Pause my emails" told you what would happen if you
                      pressed it and left you to infer what was true now —
                      which is the thing somebody opens this section to
                      check. */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={emailsOn}
                      aria-label="Email me about matching requests"
                      className={styles.switch}
                      disabled={busy}
                      onClick={() =>
                        void save(
                          /* Both flags, together. The copy here has always been
                           about email while the control wrote is_available and
                           left notify_by_email alone — and the matching query
                           requires both, so a "paused" donor was only half
                           paused with nothing on screen saying which half. */
                          { isAvailable: !emailsOn, notifyByEmail: !emailsOn },
                          emailsOn
                            ? 'Paused. We will not email you until you turn this back on.'
                            : 'You are back on the list.',
                        )
                      }
                    >
                      <span className={styles.switchTrack} aria-hidden="true">
                        <span className={styles.switchThumb} />
                      </span>
                      <span className={styles.switchLabel}>
                        {emailsOn ? 'On' : 'Paused'}
                      </span>
                    </button>
                  </div>

                  {/* What the subscription IS, in one sentence, whatever state
                    it is in. Whether it is running is the status element's
                    job — saying it here too is how the same fact ends up on
                    the page twice, which is what this rebuild is about. */}
                  <p className={styles.sectionBody}>
                    When an admin approves a request your blood type can help with in your
                    city, we email you. Pause it any time — nothing is deleted.
                  </p>

                  <h3 className={styles.subHead}>What we have emailed you about</h3>

                  {loadingHistory && (
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
                    <div className={styles.empty}>
                      <DonationMark />
                      <p className={styles.emptyLine}>
                        No requests have reached you yet.
                      </p>
                    </div>
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
                              <time dateTime={row.createdAt}>
                                {timeAgo(row.createdAt)}
                              </time>
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
              </div>

              {/* ══ 4. Data and account ═══════════════════════════════════════
                Recessed, and outside the panel above rather than inside it:
                both are rights rather than tasks, and one cannot be undone.
                A change of ground is what separates them from the working
                part of the page — nested in the same surface, it was just
                another section of it.                                     */}
              <section className={styles.footer} style={{ '--tier': 3 } as CSSProperties}>
                <div className={styles.footerRow}>
                  <div>
                    <h2 className={styles.footerTitle}>Your data</h2>
                    <p className={styles.footerBody}>
                      Your account, your details, the requests you have posted and every
                      email we have sent you.
                    </p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => void download()}>
                    <Icon name="download" />
                    Download
                  </Button>
                </div>

                <div className={styles.footerRow}>
                  <div>
                    <h2 className={styles.footerTitle}>Delete your account</h2>
                    <p className={styles.footerBody}>
                      Removes everything above. This cannot be undone.
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={styles.deleteButton}
                    onClick={() => setConfirmingDelete(true)}
                  >
                    Delete my account
                  </Button>
                </div>
              </section>
            </>
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
            <p className={styles.modalBody}>
              This removes your account, your donor details and any requests you have
              posted, along with the phone number on them. It cannot be undone.
            </p>
            <p className={styles.modalBody}>
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
