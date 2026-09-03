import { useState, type SyntheticEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { loginSchema } from '@kapka/shared';
import { AuthLayout, Button, Field, Icon, Input } from '../components';
import { api, ApiError } from '../lib/api';
import { useSession } from '../lib/session';
import { PATHS } from './paths';
import styles from './Login.module.css';

/**
 * Sign in (§9.2).
 *
 * The product had no way back in: registering signed you in for as long as
 * the tab lived, and after that the account existed with nothing anywhere to
 * open it. Everything else here — the profile, posting a request, the
 * moderation queue — was reachable only by whoever happened to still have a
 * session.
 */
export default function Login() {
  const { signIn } = useSession();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    setError(null);

    // The same schema the API validates with, so the two cannot disagree
    // about what an address looks like.
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check both fields and try again.');
      return;
    }

    setBusy(true);
    try {
      signIn(await api.login(parsed.data));
      /* replace, so Back does not return to a sign-in screen for an account
         that is now signed in. */
      void navigate(PATHS.dashboard, { replace: true });
    } catch (caught) {
      /* Whatever the API said, unchanged. It answers one message for a wrong
         password, an unknown address and a deactivated account alike, and
         improving on that here would tell somebody guessing which addresses
         have accounts (§12). */
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'We could not sign you in. Try again shortly.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title={
        <>
          Welcome back
          {/* The little heart is punctuation, not information. */}
          <span className={styles.titleHeart} aria-hidden="true">
            <Icon name="heart" />
          </span>
        </>
      }
      subtitle="Sign in to continue saving lives"
      back={PATHS.register}
      mark
      scene
      centred
      footer={
        <>
          Don’t have an account?
          <Link className={styles.link} to={PATHS.createAccount}>
            Create one
            <Icon name="chevronRight" />
          </Link>
        </>
      }
    >
      <form
        className={styles.form}
        onSubmit={(event) => void handleSubmit(event)}
        noValidate
      >
        {error && (
          <p className={styles.error} role="alert">
            <Icon name="alertCircle" />
            {error}
          </p>
        )}

        {/* hideLabel, not a bare placeholder: the reference design puts the
            field's name inside the box, and a placeholder that disappears as
            soon as somebody types is not a label (§8 Tier 1). The label is
            still there for anyone listening to the page. */}
        <Field label="Email" hideLabel required>
          <span className={styles.control}>
            <Icon name="mail" className={styles.controlIcon} />
            <Input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="Email"
              className={styles.input}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </span>
        </Field>

        <Field label="Password" hideLabel required>
          <span className={styles.control}>
            <Icon name="lock" className={styles.controlIcon} />
            <Input
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Password"
              className={styles.input}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              type="button"
              className={styles.reveal}
              onClick={() => setShowPassword((on) => !on)}
              aria-pressed={showPassword}
            >
              <Icon name={showPassword ? 'eyeOff' : 'eye'} />
              <span className="visually-hidden">
                {showPassword ? 'Hide password' : 'Show password'}
              </span>
            </button>
          </span>
        </Field>

        <Button
          type="submit"
          size="lg"
          fullWidth
          loading={busy}
          loadingLabel="Signing in…"
        >
          Sign in
          {/* At the edge rather than beside the label, so the label stays
              centred on the button and the arrow points off it — a door
              handle, not part of the word. */}
          <Icon name="arrowRight" className={styles.submitArrow} />
        </Button>
      </form>
    </AuthLayout>
  );
}
