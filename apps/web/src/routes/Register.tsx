import { useState, type SyntheticEvent } from 'react';
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
import { api, ApiError, type Session } from '../lib/api';
import { useSession } from '../lib/session';
import { PATHS } from './paths';
import styles from './Register.module.css';

type Errors = Partial<Record<string, string>>;

const TODAY = new Date().toISOString().slice(0, 10);

/**
 * Donor registration (§9.2).
 *
 * Validation runs through registerSchema — the same object the API validates
 * with — so the two can never disagree about what is acceptable. What the
 * server rejects, this form has already caught, and anything only the server
 * can know (that an email is taken) comes back with a `field` and lands on
 * the input it belongs to.
 */
export default function Register() {
  const { signIn } = useSession();
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

  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    setFormError(null);

    const candidate = {
      fullName,
      email,
      password,
      bloodType,
      city,
      lastDonationDate: neverDonated ? null : lastDonationDate,
      ...(phone.trim() ? { phone } : {}),
    };

    const parsed = registerSchema.safeParse(candidate);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.map(String).join('.') || 'form';
        // First message per field wins — a stack of three under one input is
        // noise, and fixing the first usually clears the rest.
        next[key] ??= issue.message;
      }
      setErrors(next);
      // Without this the page silently does nothing when the invalid field is
      // scrolled off screen.
      document
        .querySelector<HTMLElement>('[aria-invalid="true"]')
        ?.focus({ preventScroll: false });
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
            </div>

            <form
              className={styles.form}
              onSubmit={(event) => void handleSubmit(event)}
              noValidate
            >
              {formError && (
                <p className={styles.formError} role="alert">
                  <Icon name="alertCircle" />
                  {formError}
                </p>
              )}

              <Field label="Full name" required error={errors.fullName}>
                <Input
                  autoComplete="name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
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
                  onChange={(event) => setEmail(event.target.value)}
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
                    onChange={(event) => setPassword(event.target.value)}
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

              {/* Chips rather than a select: eight options, and the one thing
                  on this form a donor must not get wrong. */}
              <Field label="Blood type" required error={errors.bloodType}>
                <div className={styles.types} role="group" aria-label="Blood type">
                  {BLOOD_TYPES.map((type) => (
                    <FilterChip
                      key={type}
                      selected={bloodType === type}
                      onClick={() => setBloodType(type)}
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
                <p className={styles.legendHelp}>
                  You become eligible again {DONATION_INTERVAL_DAYS} days after giving.
                </p>

                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={neverDonated}
                    onChange={(event) => setNeverDonated(event.target.checked)}
                  />
                  I have never donated
                </label>

                {!neverDonated && (
                  <Field label="Date of last donation" error={errors.lastDonationDate}>
                    <Input
                      type="date"
                      max={TODAY}
                      value={lastDonationDate}
                      onChange={(event) => setLastDonationDate(event.target.value)}
                    />
                  </Field>
                )}
              </fieldset>

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
                  onChange={(event) => setPhone(event.target.value)}
                />
              </Field>

              <div className={styles.submit}>
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
            </form>
          </div>
        </Container>
      </div>
    </>
  );
}
