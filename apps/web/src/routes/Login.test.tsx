import { useEffect, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoginInput } from '@kapka/shared';
import { SessionProvider } from '../lib/SessionProvider';
import { useSession } from '../lib/session';
import { ApiError, type Session } from '../lib/api';
import Login from './Login';

const login = vi.fn<(input: LoginInput) => Promise<Session>>();
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, api: { login: (input: LoginInput) => login(input) } };
});

const SESSION: Session = {
  user: {
    id: 'u1',
    email: 'ana@example.com',
    fullName: 'Ana Petrovska',
    role: 'donor',
    emailVerified: true,
    hasDonorProfile: true,
  },
  accessToken: 'token',
};

/** Reports what the session holds, so a test can see the sign-in land. */
function Signed({ children }: { children: ReactNode }) {
  const { session } = useSession();
  useEffect(() => undefined, [session]);
  return (
    <>
      {children}
      <p>{session ? `signed in as ${session.user.fullName}` : 'signed out'}</p>
    </>
  );
}

function renderLogin() {
  return render(
    <MemoryRouter>
      <SessionProvider>
        <Signed>
          <Login />
        </Signed>
      </SessionProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  login.mockReset();
  login.mockResolvedValue(SESSION);
});

describe('signing in', () => {
  it('signs in and holds the session', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/Email/), 'ana@example.com');
    await user.type(screen.getByLabelText(/Password/), 'a-long-enough-password');
    await user.click(screen.getByRole('button', { name: /Sign in/ }));

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith({
        email: 'ana@example.com',
        password: 'a-long-enough-password',
      });
    });
    expect(await screen.findByText(/signed in as Ana Petrovska/)).toBeInTheDocument();
  });

  it('shows the API’s answer, and does not improve on it', async () => {
    /* One message for a wrong password, an unknown address and a deactivated
       account alike. Anything more specific here would tell somebody guessing
       which addresses have accounts (§12). */
    const user = userEvent.setup();
    login.mockRejectedValue(
      new ApiError('INVALID_CREDENTIALS', 'That email and password do not match.', 401),
    );
    renderLogin();

    await user.type(screen.getByLabelText(/Email/), 'ana@example.com');
    await user.type(screen.getByLabelText(/Password/), 'not-the-password');
    await user.click(screen.getByRole('button', { name: /Sign in/ }));

    expect(
      await screen.findByText('That email and password do not match.'),
    ).toBeInTheDocument();
    expect(screen.getByText('signed out')).toBeInTheDocument();
  });

  it('does not call the API with an address that cannot be one', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/Email/), 'not-an-address');
    await user.type(screen.getByLabelText(/Password/), 'a-long-enough-password');
    await user.click(screen.getByRole('button', { name: /Sign in/ }));

    // The message comes from loginSchema, the same object the API validates
    // with, so the two cannot disagree about what an address is.
    expect(await screen.findByText(/valid email/i)).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('offers the password as text, for anyone who needs to check it', async () => {
    const user = userEvent.setup();
    renderLogin();
    const password = screen.getByLabelText(/Password/);

    expect(password).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: /Show password/ }));
    expect(password).toHaveAttribute('type', 'text');
  });
});
