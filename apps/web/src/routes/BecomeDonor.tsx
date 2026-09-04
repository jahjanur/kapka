import { useState, type SyntheticEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AuthLayout,
  BloodTypeLabel,
  Button,
  Field,
  FilterChip,
  Input,
  Picker,
  Stack,
  useToast,
} from '../components';
import {
  BLOOD_TYPES,
  CITIES,
  DONATION_INTERVAL_DAYS,
  donorProfilePutSchema,
  type BloodType,
} from '@kapka/shared';
import { api, ApiError } from '../lib/api';
import { useSession } from '../lib/session';
import { PATHS } from './paths';
import styles from './Register.module.css';

/** No date in the future — the same rule the schema enforces. */
const TODAY = new Date().toISOString().slice(0, 10);

/**
 * The two fields that turn an account into a donor.
 *
 * It exists because an account and a donor are not the same thing: signing in
 * with Google makes a user with no blood type and no city, because Google
 * knows neither and both are required. Until this screen, that person was a
 * donor in name only — invisible to the matching query, never emailed, and
 * with nowhere to go. The register form could not help them either: it makes
 * a NEW account, so it answered "that email already has an account".
 *
 * Deliberately not a branch inside Register: that form is two steps, eight
 * fields and a confirmation screen, and none of it applies to somebody who
 * already has the account. This asks for exactly what is missing.
 */
export default function BecomeDonor() {
  const { session, signIn } = useSession();
  const navigate = useNavigate();
  const toast = useToast();

  const [bloodType, setBloodType] = useState<BloodType | null>(null);
  const [city, setCity] = useState('');
  const [neverDonated, setNeverDonated] = useState(true);
  const [lastDonationDate, setLastDonationDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (!session) return;

    /* The same schema the API validates with, so the two cannot disagree
       about what a profile needs. */
    const parsed = donorProfilePutSchema.safeParse({
      bloodType,
      city,
      lastDonationDate: neverDonated ? null : lastDonationDate,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the fields above.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await api.createDonorProfile(parsed.data, session.accessToken);

      /* The session carries hasDonorProfile, and every register CTA in the
         product reads it. Updating it here is what makes them all disappear
         on the way to the next screen rather than after a hard refresh. */
      signIn({ ...session, user: { ...session.user, hasDonorProfile: true } });

      toast.show('You are on the list. We will email you when you can help.', {
        tone: 'success',
      });
      void navigate(PATHS.dashboard, { replace: true });
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Something went wrong saving that. Try again.',
      );
      setSaving(false);
    }
  };

  return (
    <AuthLayout
      title="Become a donor"
      subtitle="Your account is ready. These two are what let us match you."
      back={PATHS.dashboard}
    >
      <form onSubmit={(event) => void handleSubmit(event)} noValidate>
        <Stack gap={5}>
          {/* Chips rather than a select: eight options, and the one thing here
              a donor must not get wrong. */}
          <Field label="Blood type" required>
            <div className={styles.types} role="group" aria-label="Blood type">
              {BLOOD_TYPES.map((type) => (
                <FilterChip
                  key={type}
                  selected={bloodType === type}
                  onClick={() => {
                    setBloodType(type);
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
            help="We match donors to requests in the same city."
          >
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
            <p className={styles.legendHelp}>
              You become eligible again {DONATION_INTERVAL_DAYS} days after giving.
            </p>

            <label className={styles.check}>
              <input
                type="checkbox"
                checked={neverDonated}
                onChange={(event) => {
                  setNeverDonated(event.target.checked);
                }}
              />
              I have never donated
            </label>

            {!neverDonated && (
              <Field label="Date of last donation">
                <Input
                  type="date"
                  max={TODAY}
                  value={lastDonationDate}
                  onChange={(event) => {
                    setLastDonationDate(event.target.value);
                  }}
                />
              </Field>
            )}
          </fieldset>

          {/* Assertive: it is the answer to the button they just pressed. */}
          {error && (
            <p className={styles.formError} role="alert">
              {error}
            </p>
          )}

          <Button
            type="submit"
            size="lg"
            fullWidth
            loading={saving}
            loadingLabel="Adding you to the list…"
          >
            Join the donors
          </Button>
        </Stack>
      </form>
    </AuthLayout>
  );
}
