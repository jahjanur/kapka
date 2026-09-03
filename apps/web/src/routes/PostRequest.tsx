import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useState,
  type SyntheticEvent,
} from 'react';
import {
  AppHeader,
  BloodTypeLabel,
  Button,
  Container,
  EmptyState,
  Field,
  Icon,
  Input,
  Picker,
  RequestCard,
  Select,
  Textarea,
  UrgencyPill,
} from '../components';
import {
  BLOOD_TYPES,
  CITIES,
  createRequestSchema,
  NOTE_MAX_LENGTH,
  UNITS_MAX,
  UNITS_MIN,
  URGENCIES,
  type BloodType,
  type PublicBloodRequest,
  type Urgency,
} from '@kapka/shared';
import { BREAKPOINTS } from '@kapka/tokens';
import { api, ApiError } from '../lib/api';
import { cx } from '../lib/cx';
import { useFieldErrors } from '../lib/useFieldErrors';
import { useMediaQuery } from '../lib/useMediaQuery';
import { clearDraft, EMPTY_DRAFT, readDraft, writeDraft } from '../lib/requestDraft';
import { useSession } from '../lib/session';
import { PATHS } from './paths';
import styles from './PostRequest.module.css';

/**
 * The preview column, and with it the map, exist from lg up.
 *
 * Leaflet is behind a lazy import as well as this check, so a phone on 3G in a
 * hospital corridor never downloads a mapping library it has nowhere to put
 * (§11). The coordinates it produces are optional — the hospital name and city
 * are what the matching and the email actually use.
 */
const WIDE = `(min-width: ${String(BREAKPOINTS.lg / 16)}rem)`;

const HospitalMap = lazy(() => import('../components/HospitalMap/HospitalMap'));

const UNIT_OPTIONS = Array.from({ length: UNITS_MAX - UNITS_MIN + 1 }, (_, i) =>
  String(UNITS_MIN + i),
);

const URGENCY_HELP: Record<Urgency, string> = {
  routine: 'Planned, or a stock top-up.',
  urgent: 'Needed today.',
  critical: 'Needed now — a life is on it.',
};

/**
 * Post a blood request (§9.3) — the two-minute screen.
 *
 * Everything here is either something the matching query needs or something a
 * donor reads before deciding to go. There is no field on this form that only
 * an administrator would want.
 *
 * Fields are checked when they lose focus, never on a keystroke, through the
 * same schema the API validates with — see useFieldErrors.
 */
export default function PostRequest() {
  const { session, restoring } = useSession();
  const wide = useMediaQuery(WIDE);

  /* Read once, before the first render, so a restored form is simply what is
     on screen — restoring in an effect would paint an empty form first and
     then fill it in, which reads as the page having lost the work and found
     it again. */
  const [restored] = useState(() => readDraft());
  const start = restored ?? EMPTY_DRAFT;
  const [keptDraft, setKeptDraft] = useState(restored !== null);

  const [bloodType, setBloodType] = useState<BloodType | null>(start.bloodType);
  const [unitsNeeded, setUnitsNeeded] = useState(start.unitsNeeded);
  const [urgency, setUrgency] = useState<Urgency>(start.urgency);
  const [hospitalName, setHospitalName] = useState(start.hospitalName);
  const [city, setCity] = useState(start.city);
  const [contactPhone, setContactPhone] = useState(start.contactPhone);
  const [note, setNote] = useState(start.note);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(start.pin);

  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [posted, setPosted] = useState<PublicBloodRequest | null>(null);

  /*
   * Every change, straight to storage. The connection this form is filled in
   * on drops in lifts and stairwells, and a request half-typed by someone
   * whose relative is in surgery is not something to lose to a reload.
   *
   * It runs per render rather than per keystroke — React has already batched
   * by the time an effect fires — and writes under a kilobyte, so there is
   * nothing here worth debouncing. A debounce would only reintroduce the
   * window this exists to close.
   */
  useEffect(() => {
    writeDraft({
      bloodType,
      unitsNeeded,
      urgency,
      hospitalName,
      city,
      contactPhone,
      note,
      pin,
    });
  }, [bloodType, unitsNeeded, urgency, hospitalName, city, contactPhone, note, pin]);

  /** Throws the draft away and empties the form. */
  function discardDraft() {
    clearDraft();
    setKeptDraft(false);
    setBloodType(EMPTY_DRAFT.bloodType);
    setUnitsNeeded(EMPTY_DRAFT.unitsNeeded);
    setUrgency(EMPTY_DRAFT.urgency);
    setHospitalName(EMPTY_DRAFT.hospitalName);
    setCity(EMPTY_DRAFT.city);
    setContactPhone(EMPTY_DRAFT.contactPhone);
    setNote(EMPTY_DRAFT.note);
    setPin(EMPTY_DRAFT.pin);
  }

  /* Focus has to move after the render that marks the fields invalid, not in
     the handler that set them — nothing carries aria-invalid until then. */
  const [focusRequest, setFocusRequest] = useState(0);
  useEffect(() => {
    if (focusRequest === 0) return;
    document
      .querySelector<HTMLElement>('[aria-invalid="true"]')
      ?.focus({ preventScroll: false });
  }, [focusRequest]);

  const candidate = useCallback(
    (overrides: Record<string, unknown> = {}) => ({
      bloodType,
      unitsNeeded: Number(unitsNeeded),
      urgency,
      hospitalName,
      city,
      contactPhone,
      note: note.trim() ? note : null,
      hospitalLat: pin?.lat ?? null,
      hospitalLng: pin?.lng ?? null,
      ...overrides,
    }),
    [bloodType, unitsNeeded, urgency, hospitalName, city, contactPhone, note, pin],
  );

  const { errors, check, clear, checkAll } = useFieldErrors(
    createRequestSchema,
    candidate,
  );

  const onPick = useCallback((lat: number, lng: number) => {
    setPin({ lat, lng });
  }, []);

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    setFormError(null);

    const parsed = createRequestSchema.safeParse(candidate());
    if (!parsed.success) {
      checkAll();
      setFocusRequest((n) => n + 1);
      return;
    }

    if (!session) return; // The form is not rendered without one.

    setSubmitting(true);
    try {
      const created = await api.createRequest(parsed.data, session.accessToken);
      /* Only once the API has it. Clearing before the call would lose the
         draft to the exact failure it is here for — and this machine may well
         be a shared one, so a posted request has no business staying in its
         storage either. */
      clearDraft();
      setPosted(created);
    } catch (error) {
      if (error instanceof ApiError) setFormError(error.message);
      else setFormError('Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  /* ── Signed out ────────────────────────────────────────────────────────
     Posting is authenticated (§4), and there is no sign-in screen yet. Saying
     so plainly beats a form that collects two minutes of typing and then
     answers 401.                                                            */
  // Not before the boot refresh has answered — see SessionProvider.
  if (restoring) return <AppHeader />;

  if (!session) {
    return (
      <>
        <AppHeader />
        <div className={styles.page}>
          <Container>
            <EmptyState
              icon="alertCircle"
              headline="You need an account to post a request"
              body="A request is checked by an admin before any donor hears about it, so it has to belong to somebody. Creating an account takes about a minute."
              action={
                <Button to={PATHS.register} size="lg">
                  Create an account
                </Button>
              }
            />
          </Container>
        </div>
      </>
    );
  }

  /* ── Posted ─────────────────────────────────────────────────────────── */
  if (posted) {
    return (
      <>
        <AppHeader />
        <div className={styles.page}>
          <Container>
            <div className={styles.done}>
              <span className={styles.doneMark} aria-hidden="true">
                <Icon name="checkCircle" />
              </span>
              <h1 className={styles.title}>Your request is with an admin</h1>
              {/* Not "donors have been notified". Nothing is sent until it is
                  approved, and a requester who believes otherwise will stop
                  looking for blood by other means. */}
              <p className={styles.lead}>
                Someone checks it before any donor is emailed — usually within minutes.
                When it is approved, every matching donor in {posted.city} gets an email
                at once.
              </p>
              <div className={styles.doneActions}>
                <Button to={PATHS.feed} size="lg">
                  See open requests
                </Button>
              </div>
            </div>
          </Container>
        </div>
      </>
    );
  }

  /** What the feed will show, from what has been filled in so far. */
  const preview: PublicBloodRequest | null = bloodType
    ? {
        id: 'preview',
        bloodType,
        unitsNeeded: Number(unitsNeeded),
        urgency,
        hospitalName: hospitalName.trim() || 'The hospital',
        city: city || 'Your city',
        note: note.trim() || null,
        status: 'pending',
        createdAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
      }
    : null;

  return (
    <>
      <AppHeader />

      <div className={styles.page}>
        <Container>
          <div className={styles.layout}>
            <form
              className={styles.form}
              onSubmit={(event) => void handleSubmit(event)}
              noValidate
            >
              <div className={styles.intro}>
                <h1 className={styles.title}>Post a request</h1>
                <p className={styles.lead}>
                  Two minutes. An admin checks it, then every compatible donor in the city
                  is emailed at once.
                </p>
              </div>

              {keptDraft && (
                /* Said out loud rather than silently refilling the fields. A
                   form that is mysteriously already filled in is unsettling,
                   and on a shared machine the honest reading of it is "whose
                   is this?" — so the way to throw it away sits right here. */
                <p className={styles.draftNote}>
                  <Icon name="info" />
                  <span>
                    We kept what you had typed here.{' '}
                    <Button variant="ghost" size="sm" onClick={discardDraft}>
                      Start over
                    </Button>
                  </span>
                </p>
              )}

              {formError && (
                <p className={styles.formError} role="alert">
                  <Icon name="alertCircle" />
                  {formError}
                </p>
              )}

              {/* Eight buttons in a grid rather than a dropdown: it is the one
                  answer on this form that must not be wrong, and a grid shows
                  all eight at once instead of hiding seven behind a tap. */}
              <Field
                label="Blood type the patient needs"
                required
                error={errors.bloodType}
                help="The type the patient receives, not the donor's."
              >
                <div className={styles.typeGrid} role="group" aria-label="Blood type">
                  {BLOOD_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      className={cx(
                        styles.typeButton,
                        bloodType === type && styles.typeButtonOn,
                      )}
                      aria-pressed={bloodType === type}
                      onClick={() => {
                        setBloodType(type);
                        check('bloodType', { bloodType: type });
                      }}
                    >
                      <BloodTypeLabel type={type} />
                    </button>
                  ))}
                </div>
              </Field>

              <div className={styles.pair}>
                <Field label="Units needed" required error={errors.unitsNeeded}>
                  <Select
                    value={unitsNeeded}
                    onChange={(event) => {
                      setUnitsNeeded(event.target.value);
                      check('unitsNeeded', { unitsNeeded: Number(event.target.value) });
                    }}
                  >
                    {UNIT_OPTIONS.map((count) => (
                      <option key={count} value={count}>
                        {count}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="City" required error={errors.city}>
                  <Picker
                    placeholder="Choose the city"
                    icon="mapPin"
                    options={CITIES}
                    value={city}
                    onChange={(next) => {
                      setCity(next);
                      check('city', { city: next });
                    }}
                  />
                </Field>
              </div>

              <Field label="How urgent" required error={errors.urgency}>
                <div className={styles.urgency} role="group" aria-label="Urgency">
                  {URGENCIES.map((level) => (
                    <button
                      key={level}
                      type="button"
                      className={cx(
                        styles.urgencyButton,
                        urgency === level && styles.urgencyButtonOn,
                      )}
                      aria-pressed={urgency === level}
                      onClick={() => setUrgency(level)}
                    >
                      <UrgencyPill urgency={level} />
                      <span className={styles.urgencyHelp}>{URGENCY_HELP[level]}</span>
                    </button>
                  ))}
                </div>
              </Field>

              <Field
                label="Hospital"
                required
                error={errors.hospitalName}
                help="The name a donor would ask for at the door."
              >
                <Input
                  autoComplete="off"
                  value={hospitalName}
                  onChange={(event) => {
                    setHospitalName(event.target.value);
                    clear('hospitalName');
                  }}
                  onBlur={() => {
                    check('hospitalName');
                  }}
                />
              </Field>

              <Field
                label="Contact phone"
                required
                error={errors.contactPhone}
                help="Shown to donors who open the request. Nothing calls it automatically."
              >
                <Input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={contactPhone}
                  onChange={(event) => {
                    setContactPhone(event.target.value);
                    clear('contactPhone');
                  }}
                  onBlur={() => {
                    check('contactPhone');
                  }}
                />
              </Field>

              <Field
                label="Anything else"
                optional
                error={errors.note}
                help={`${String(NOTE_MAX_LENGTH - note.length)} characters left. Never patient names or medical details.`}
              >
                <Textarea
                  rows={3}
                  maxLength={NOTE_MAX_LENGTH}
                  value={note}
                  onChange={(event) => {
                    setNote(event.target.value);
                    clear('note');
                  }}
                  onBlur={() => {
                    check('note');
                  }}
                />
              </Field>

              <div className={styles.submit}>
                <Button
                  type="submit"
                  size="lg"
                  fullWidth
                  loading={submitting}
                  loadingLabel="Posting your request…"
                >
                  Post request
                </Button>
                <p className={styles.submitNote}>
                  An admin approves it before any donor is emailed.
                </p>
              </div>
            </form>

            {/* ── The preview column ──────────────────────────────────────
                lg and up only. It is a mirror of the form, so it is rendered
                inert: a screen reader user gets the fields themselves, and a
                second announced copy of every value as they type would be
                noise rather than help. The heading stays outside it.         */}
            {wide && (
              <aside className={styles.aside}>
                <h2 className={styles.asideTitle}>How donors will see it</h2>

                {preview ? (
                  <div className={styles.previewCard} inert>
                    <RequestCard request={preview} />
                  </div>
                ) : (
                  <p className={styles.previewEmpty}>
                    Choose a blood type and this fills in.
                  </p>
                )}

                <h2 className={styles.asideTitle}>
                  Where it is <span className={styles.optional}>Optional</span>
                </h2>
                <p className={styles.mapHelp}>
                  Click the map to drop a pin on the hospital. It is what "Directions"
                  hands the donor's maps app — the door, rather than a name to search for.
                </p>

                <Suspense
                  fallback={<div className={styles.mapLoading} aria-hidden="true" />}
                >
                  <HospitalMap
                    lat={pin?.lat ?? null}
                    lng={pin?.lng ?? null}
                    onPick={onPick}
                  />
                </Suspense>

                {pin && (
                  <p className={styles.pinNote}>
                    Pin placed.{' '}
                    <Button variant="ghost" size="sm" onClick={() => setPin(null)}>
                      Remove it
                    </Button>
                  </p>
                )}
              </aside>
            )}
          </div>
        </Container>
      </div>
    </>
  );
}
