import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  AppHeader,
  BloodTypeLabel,
  Button,
  Container,
  Field,
  FilterChip,
  Icon,
  Input,
  Select,
} from '../components';
import {
  BLOOD_TYPES,
  CITIES,
  DONATION_INTERVAL_DAYS,
  registerSchema,
  type BloodType,
} from '@kapka/shared';
import { BREAKPOINTS } from '@kapka/tokens';
import { api, ApiError, type Session } from '../lib/api';
import { cx } from '../lib/cx';
import { useFieldErrors } from '../lib/useFieldErrors';
import { useMediaQuery } from '../lib/useMediaQuery';
import { useSession } from '../lib/session';
import { PATHS } from './paths';
import styles from './Register.module.css';

type Step = 1 | 2;

const TODAY = new Date().toISOString().slice(0, 10);

/**
 * From md upward the whole form fits on one page; below it, two short steps.
 *
 * Derived from the token rather than typed out again — Register.module.css
 * uses the same width, and a form that steps while the CSS thinks it does not
 * would be broken in a way nobody would think to check for.
 */
const SINGLE_PAGE = `(min-width: ${String(BREAKPOINTS.md / 16)}rem)`;

/**
 * Which field belongs to which step, so Continue can validate its own half and
 * leave the rest alone. A donor should not be told their blood type is missing
 * while looking at a screen that does not ask for it.
 */
const STEP_FIELDS: Record<Step, readonly string[]> = {
  1: ['fullName', 'email', 'password', 'phone'],
  2: ['bloodType', 'city', 'lastDonationDate'],
};

const STEP_TITLES: Record<Step, string> = {
  1: 'About you',
  2: 'Your blood',
};

/**
 * Donor registration (§9.2).
 *
 * Validation runs through registerSchema — the same object the API validates
 * with — so the two can never disagree about what is acceptable. What the
 * server rejects, this form has already caught, and anything only the server
 * can know (that an email is taken) comes back with a `field` and lands on
 * the input it belongs to.
 *
 * Fields are checked when they lose focus, never while they are being typed
 * in. Validating on every keystroke tells someone their email is invalid
 * three characters into typing it, which is both true and useless.
 */
export default function Register() {
  const { signIn } = useSession();
  const singlePage = useMediaQuery(SINGLE_PAGE);
  const [step, setStep] = useState<Step>(1);

  /* The whole session, not just the address: asking for another confirmation
     link is an authenticated call, and this screen is where it is asked for. */
  const [registered, setRegistered] = useState<Session | null>(null);
  const [resending, setResending] = useState(false);
  const [resendNote, setResendNote] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [bloodType, setBloodType] = useState<BloodType | null>(null);
  const [city, setCity] = useState('');
  const [neverDonated, setNeverDonated] = useState(true);
  const [lastDonationDate, setLastDonationDate] = useState('');
  const [phone, setPhone] = useState('');

  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /* Focus has to move AFTER the render that shows the errors: nothing carries
     aria-invalid until then, so looking for it in the handler that set them
     finds the previous DOM and quietly focuses nothing. Bumping a counter is
     what gets the search into an effect, where the DOM is current. */
  const [focusRequest, setFocusRequest] = useState(0);
  useEffect(() => {
    if (focusRequest === 0) return;
    document
      .querySelector<HTMLElement>('[aria-invalid="true"]')
      ?.focus({ preventScroll: false });
  }, [focusRequest]);

  /* Changing step moves focus to the new step's heading, so a screen reader
     announces where it now is rather than being left on a button that has
     just disappeared.

     Compared against the previous step rather than a "have I mounted" flag.
     A ref survives StrictMode's mount-unmount-mount, so the flag was already
     true the second time round and the heading took focus on page load —
     which put the first Tab past the skip link and the whole header. This
     way a remount changes nothing, because the step has not changed. */
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(step);
  useEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    /* Unless the step changed in order to show a problem. The effect above
       has already put focus on the offending input — it is declared first, so
       it runs first — and announcing "About you" while taking focus off the
       field that is wrong helps nobody. */
    if (document.querySelector('[aria-invalid="true"]')) return;
    stepHeading.current?.focus();
  }, [step]);

  /** Everything the schema wants, with any just-changed value applied. */
  const candidate = useCallback(
    (overrides: Record<string, unknown> = {}) => ({
      fullName,
      email,
      password,
      bloodType,
      city,
      lastDonationDate: neverDonated ? null : lastDonationDate,
      ...(phone.trim() ? { phone } : {}),
      ...overrides,
    }),
    [fullName, email, password, bloodType, city, neverDonated, lastDonationDate, phone],
  );

  const {
    errors,
    check: checkField,
    clear: clearError,
    checkAll,
    checkSome,
    set: setErrors,
  } = useFieldErrors(registerSchema, candidate);

  function handleContinue() {
    const found = checkSome(STEP_FIELDS[1]);
    if (Object.keys(found).length > 0) {
      setFocusRequest((n) => n + 1);
      return;
    }
    setStep(2);
  }

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();

    /* On a phone, step one has no submit button — but pressing Enter in a
       text field still asks the form to submit. That means "next", not "send
       me half a registration". */
    if (!singlePage && step === 1) {
      handleContinue();
      return;
    }

    setFormError(null);

    const parsed = registerSchema.safeParse(candidate());
    if (!parsed.success) {
      const found = checkAll();

      /* Something invalid on the step that is not showing would otherwise be
         a form that refuses to submit and says nothing anyone can see. */
      if (!singlePage && STEP_FIELDS[1].some((field) => field in found)) setStep(1);

      setFocusRequest((n) => n + 1);
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      const session = await api.register(parsed.data);
      signIn(session);
      // Confirmed in place rather than on a route of its own: a /registered
      // URL is reachable by reload and by anyone who bookmarks it, and it has
      // nothing true to say to either.
      setRegistered(session);
    } catch (error) {
      if (error instanceof ApiError && error.field) {
        setErrors({ [error.field]: error.message });

        /* Same rule as the local check above, for the same reason. "That
           email already has an account" is the one rejection only the server
           can make, and it names a step-one field — so on a phone it would
           otherwise be written onto an input that is not rendered, leaving
           the donor on step two pressing a button that appears to do nothing
           at all. The end-to-end test at 390 is what found this. */
        if (!singlePage && STEP_FIELDS[1].includes(error.field)) setStep(1);

        setFocusRequest((n) => n + 1);
      } else if (error instanceof ApiError) {
        setFormError(error.message);
      } else {
        setFormError('Something went wrong. Try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (!registered) return;
    setResendNote(null);
    setResending(true);
    try {
      const result = await api.resendVerification(registered.accessToken);
      setResendNote(
        result.emailVerified
          ? 'That address is already confirmed. You are on the list.'
          : 'Sent. Give it a minute, and check your spam folder.',
      );
    } catch (error) {
      setResendNote(
        error instanceof ApiError
          ? error.message
          : 'We could not send that email. Try again shortly.',
      );
    } finally {
      setResending(false);
    }
  }

  if (registered) {
    return (
      <>
        <AppHeader />
        <div className={styles.page}>
          <Container>
            <div className={styles.done}>
              <span className={styles.doneMark} aria-hidden="true">
                <Icon name="checkCircle" />
              </span>
              <h1 className={styles.title}>Confirm your email</h1>
              {/* Not "you are on the list": they are not, until the link is
                  opened. The matching query refuses an unconfirmed donor, so
                  saying otherwise here would be a promise nothing keeps. */}
              <p className={styles.lead}>
                Your account is created. We sent a confirmation link to{' '}
                <strong>{registered.user.email}</strong> — open it and you join the donors
                we contact when someone near you needs your blood type.
              </p>
              <div className={styles.doneActions}>
                <Button to={PATHS.feed} size="lg">
                  See open requests
                </Button>
              </div>
              <p className={styles.doneNote}>
                Nothing arrived?{' '}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleResend()}
                  loading={resending}
                  loadingLabel="Sending a new link…"
                >
                  Send it again
                </Button>
              </p>
              {resendNote && (
                <p className={styles.doneNote} aria-live="polite">
                  {resendNote}
                </p>
              )}
            </div>
          </Container>
        </div>
      </>
    );
  }

  /* One page, or one step at a time. Unmounting the hidden step is safe:
     every value lives in this component's state, not in the inputs. */
  const showing = (which: Step) => singlePage || step === which;

  return (
    <>
      <AppHeader />

      <div className={styles.page}>
        <Container>
          <div className={styles.layout}>
            <div className={styles.intro}>
              <h1 className={styles.title}>Become a donor</h1>
              <p className={styles.lead}>
                Two minutes now. After that we only contact you when someone near you
                needs your blood type — never for anything else.
              </p>
              <ul className={styles.points}>
                <li>
                  <Icon name="checkCircle" />
                  We email you only for matching requests an admin has approved.
                </li>
                <li>
                  <Icon name="checkCircle" />
                  Your contact details are never shown on the public feed.
                </li>
                <li>
                  <Icon name="checkCircle" />
                  Pause the emails, or delete your account, at any time.
                </li>
              </ul>
              {/* Before the form, not buried under the submit button. Somebody
                  deciding whether to hand over their blood type should be able
                  to read what happens to it first. */}
              <p className={styles.privacy}>
                <Link to={PATHS.privacy}>What we store, and why</Link> — the whole notice
                is a two-minute read.
              </p>
            </div>

            <form
              className={styles.form}
              onSubmit={(event) => void handleSubmit(event)}
              noValidate
            >
              {!singlePage && (
                <div className={styles.progress}>
                  <p className={styles.stepCount}>Step {step} of 2</p>
                  <ol className={styles.pips} aria-hidden="true">
                    <li className={cx(styles.pip, styles.pipOn)} />
                    <li className={cx(styles.pip, step === 2 && styles.pipOn)} />
                  </ol>
                </div>
              )}

              {formError && (
                <p className={styles.formError} role="alert">
                  <Icon name="alertCircle" />
                  {formError}
                </p>
              )}

              {showing(1) && (
                <section className={styles.group} aria-labelledby="step-1-title">
                  <h2
                    id="step-1-title"
                    className={styles.stepTitle}
                    /* Focusable only as a target for the step change, never in
                       the tab order. */
                    tabIndex={-1}
                    ref={step === 1 ? stepHeading : null}
                  >
                    {STEP_TITLES[1]}
                  </h2>

                  <Field label="Full name" required error={errors.fullName}>
                    <Input
                      autoComplete="name"
                      value={fullName}
                      onChange={(event) => {
                        setFullName(event.target.value);
                        clearError('fullName');
                      }}
                      onBlur={() => {
                        checkField('fullName');
                      }}
                    />
                  </Field>

                  <Field
                    label="Email"
                    required
                    error={errors.email}
                    help="Where the notifications go."
                  >
                    <Input
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        clearError('email');
                      }}
                      onBlur={() => {
                        checkField('email');
                      }}
                    />
                  </Field>

                  <Field
                    label="Password"
                    required
                    error={errors.password}
                    help="At least 10 characters."
                  >
                    <div className={styles.password}>
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={password}
                        onChange={(event) => {
                          setPassword(event.target.value);
                          clearError('password');
                        }}
                        onBlur={() => {
                          checkField('password');
                        }}
                      />
                      <button
                        type="button"
                        className={styles.reveal}
                        onClick={() => setShowPassword((shown) => !shown)}
                        aria-pressed={showPassword}
                      >
                        <Icon name={showPassword ? 'eyeOff' : 'eye'} />
                        <span className="visually-hidden">
                          {showPassword ? 'Hide password' : 'Show password'}
                        </span>
                      </button>
                    </div>
                  </Field>

                  <Field
                    label="Phone"
                    optional
                    error={errors.phone}
                    help="Only shared with a hospital you have agreed to help."
                  >
                    <Input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={phone}
                      onChange={(event) => {
                        setPhone(event.target.value);
                        clearError('phone');
                      }}
                      onBlur={() => {
                        checkField('phone');
                      }}
                    />
                  </Field>
                </section>
              )}

              {showing(2) && (
                <section className={styles.group} aria-labelledby="step-2-title">
                  <h2
                    id="step-2-title"
                    className={styles.stepTitle}
                    tabIndex={-1}
                    ref={step === 2 ? stepHeading : null}
                  >
                    {STEP_TITLES[2]}
                  </h2>

                  {/* Chips rather than a select: eight options, and the one thing
                      on this form a donor must not get wrong. */}
                  <Field label="Blood type" required error={errors.bloodType}>
                    <div className={styles.types} role="group" aria-label="Blood type">
                      {BLOOD_TYPES.map((type) => (
                        <FilterChip
                          key={type}
                          selected={bloodType === type}
                          onClick={() => {
                            setBloodType(type);
                            /* A chip is a complete answer, not a keystroke, so
                               checking it here is not validating as they type. */
                            checkField('bloodType', { bloodType: type });
                          }}
                        >
                          <BloodTypeLabel type={type} />
                        </FilterChip>
                      ))}
                    </div>
                  </Field>

                  <Field
                    label="City"
                    required
                    error={errors.city}
                    help="We match donors to requests in the same city."
                  >
                    <Select
                      placeholder="Choose your city"
                      value={city}
                      onChange={(event) => {
                        setCity(event.target.value);
                        checkField('city', { city: event.target.value });
                      }}
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
                    <p className={styles.legendHelp}>
                      You become eligible again {DONATION_INTERVAL_DAYS} days after
                      giving.
                    </p>

                    <label className={styles.check}>
                      <input
                        type="checkbox"
                        checked={neverDonated}
                        onChange={(event) => {
                          setNeverDonated(event.target.checked);
                          // "Never donated" is always valid, and the date it
                          // hides cannot still be complaining about itself.
                          clearError('lastDonationDate');
                        }}
                      />
                      I have never donated
                    </label>

                    {!neverDonated && (
                      <Field
                        label="Date of last donation"
                        error={errors.lastDonationDate}
                      >
                        <Input
                          type="date"
                          max={TODAY}
                          value={lastDonationDate}
                          onChange={(event) => {
                            setLastDonationDate(event.target.value);
                            clearError('lastDonationDate');
                          }}
                          onBlur={() => {
                            checkField('lastDonationDate');
                          }}
                        />
                      </Field>
                    )}
                  </fieldset>
                </section>
              )}

              <div className={styles.submit}>
                {!singlePage && step === 1 ? (
                  <Button type="button" size="lg" fullWidth onClick={handleContinue}>
                    Continue
                  </Button>
                ) : (
                  <div className={styles.actions}>
                    {!singlePage && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="lg"
                        onClick={() => setStep(1)}
                      >
                        Back
                      </Button>
                    )}
                    <Button
                      type="submit"
                      size="lg"
                      fullWidth
                      loading={submitting}
                      loadingLabel="Creating your account…"
                    >
                      Register as donor
                    </Button>
                  </div>
                )}
              </div>
            </form>
          </div>
        </Container>
      </div>
    </>
  );
}
