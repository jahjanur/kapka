import { useEffect, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionProvider } from '../lib/SessionProvider';
import { useSession } from '../lib/session';
import { ApiError, type ResendResult, type Session, type SessionUser } from '../lib/api';
import VerifyEmail from './VerifyEmail';

const verifyEmail = vi.fn<(token: string) => Promise<SessionUser>>();
const resendVerification = vi.fn<(accessToken: string) => Promise<ResendResult>>();

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    api: {
      verifyEmail: (token: string) => verifyEmail(token),
      resendVerification: (accessToken: string) => resendVerification(accessToken),
    },
  };
});

const CONFIRMED: SessionUser = {
  id: 'u1',
  email: 'ana@example.com',
  fullName: 'Ana Petrovska',
  role: 'donor',
  emailVerified: true,
  hasDonorProfile: true,
};

const SESSION: Session = {
  user: { ...CONFIRMED, emailVerified: false },
  accessToken: 'access-token',
};

/** Puts a session in the provider, the way registering or signing in would. */
function SignedIn({ children }: { children: ReactNode }) {
  const { session, signIn } = useSession();
  useEffect(() => {
    signIn(SESSION);
  }, [signIn]);
  return session ? <>{children}</> : null;
}

function renderPage(search: string, signedIn = false) {
  return render(
    <MemoryRouter initialEntries={[`/verify-email${search}`]}>
      <SessionProvider>
        {signedIn ? (
          <SignedIn>
            <VerifyEmail />
          </SignedIn>
        ) : (
          <VerifyEmail />
        )}
      </SessionProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  verifyEmail.mockReset();
  resendVerification.mockReset();
  verifyEmail.mockResolvedValue(CONFIRMED);
  resendVerification.mockResolvedValue({ sent: true, emailVerified: false });
});

describe('confirming a donor email', () => {
  it('spends the token from the link and says it worked', async () => {
    renderPage('?token=abc123');
    expect(await screen.findByText(/Your email is confirmed/)).toBeInTheDocument();
    expect(verifyEmail).toHaveBeenCalledWith('abc123');
  });

  it('posts the token once, not once per render', async () => {
    // Each post spends a token. A page that fires twice burns the spare.
    renderPage('?token=abc123');
    await screen.findByText(/Your email is confirmed/);
    expect(verifyEmail).toHaveBeenCalledTimes(1);
  });

  it('asks for nothing when the link arrived without a token', async () => {
    renderPage('');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(verifyEmail).not.toHaveBeenCalled();
  });

  it("shows the API's own reason, not a generic one", async () => {
    // "Expired" and "never existed" have different fixes, and the API is the
    // only one that knows which happened.
    verifyEmail.mockRejectedValue(
      new ApiError(
        'VALIDATION_FAILED',
        'That confirmation link has expired. Ask for a new one.',
        400,
        'token',
      ),
    );
    renderPage('?token=stale');
    expect(await screen.findByRole('alert')).toHaveTextContent(/has expired/);
  });

  it('offers a signed-in donor another link', async () => {
    verifyEmail.mockRejectedValue(
      new ApiError('VALIDATION_FAILED', 'That confirmation link is not valid.', 400),
    );
    const user = userEvent.setup();
    renderPage('?token=stale', true);

    await user.click(await screen.findByRole('button', { name: /Send me a new link/ }));
    await waitFor(() => {
      expect(resendVerification).toHaveBeenCalledWith('access-token');
    });
    expect(await screen.findByText(/We sent a new link/)).toBeInTheDocument();
  });

  it('sends nobody to a resend they cannot make', async () => {
    // Resending is authenticated. With no session the honest next step is to
    // register, not a button that would answer 401.
    verifyEmail.mockRejectedValue(
      new ApiError('VALIDATION_FAILED', 'That confirmation link is not valid.', 400),
    );
    renderPage('?token=stale');

    expect(await screen.findByRole('link', { name: /Register as donor/ })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /Send me a new link/ }),
    ).not.toBeInTheDocument();
  });
});
