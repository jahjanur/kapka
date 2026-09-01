import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../lib/ThemeProvider';
import { SessionProvider } from '../lib/SessionProvider';
import type { RegisterInput } from '@kapka/shared';
import { ApiError, type Session } from '../lib/api';
import Register from './Register';

const register = vi.fn<(input: RegisterInput) => Promise<Session>>();
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, api: { register: (input: RegisterInput) => register(input) } };
});

function renderPage() {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <SessionProvider>
          <Register />
        </SessionProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

/** Fills everything the schema requires. */
async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Full name/), 'Ana Petrovska');
  await user.type(screen.getByLabelText(/^Email/), 'ana@example.com');
  await user.type(screen.getByLabelText(/^Password/), 'a-long-enough-password');
  await user.click(screen.getByRole('button', { name: 'O negative' }));
  await user.selectOptions(screen.getByLabelText(/City/), 'Skopje');
}

const submit = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: /Register as donor/ }));

beforeEach(() => {
  register.mockReset();
  register.mockResolvedValue({
    user: {
      id: 'u1',
      email: 'ana@example.com',
      fullName: 'Ana Petrovska',
      role: 'donor',
      emailVerified: false,
    },
    accessToken: 'token',
  });
});

describe('donor registration', () => {
  it('registers a donor and confirms it', async () => {
    const user = userEvent.setup();
    renderPage();
    await fillValidForm(user);
    await submit(user);

    await waitFor(() => {
      expect(register).toHaveBeenCalledTimes(1);
    });
    expect(register.mock.calls[0]?.[0]).toMatchObject({
      fullName: 'Ana Petrovska',
      email: 'ana@example.com',
      bloodType: 'O-',
      city: 'Skopje',
      // The default is "never donated", which is eligible — and null, not
      // absent, is what says so (§5.2).
      lastDonationDate: null,
    });
    // Registered is not yet on the list — the confirmation screen says so.
    expect(await screen.findByText(/Confirm your email/)).toBeInTheDocument();
  });

  it('sends no request when the form is incomplete', async () => {
    const user = userEvent.setup();
    renderPage();
    await submit(user);

    expect(register).not.toHaveBeenCalled();
    // The message comes from registerSchema, the same object the API
    // validates with, so the two cannot disagree about what is acceptable.
    expect(await screen.findByText('Enter your full name.')).toBeInTheDocument();
  });

  it('rejects a password under ten characters, in the field', async () => {
    const user = userEvent.setup();
    renderPage();
    await fillValidForm(user);
    await user.clear(screen.getByLabelText(/^Password/));
    await user.type(screen.getByLabelText(/^Password/), 'short');
    await submit(user);

    expect(register).not.toHaveBeenCalled();
    expect(await screen.findByText('Use at least 10 characters.')).toBeInTheDocument();
  });

  it('omits the phone entirely rather than sending an empty one', async () => {
    // '' is not a valid phone, and sending it would fail validation for a
    // field the donor deliberately left blank.
    const user = userEvent.setup();
    renderPage();
    await fillValidForm(user);
    await submit(user);

    await waitFor(() => {
      expect(register).toHaveBeenCalled();
    });
    expect(register.mock.calls[0]?.[0]).not.toHaveProperty('phone');
  });

  it('puts a server-side field error on the field it belongs to', async () => {
    // Only the server knows an email is taken. It comes back with a `field`,
    // and a banner at the top of the form is the wrong place for it.
    register.mockRejectedValue(
      new ApiError('EMAIL_TAKEN', 'That email is already registered.', 409, 'email'),
    );
    const user = userEvent.setup();
    renderPage();
    await fillValidForm(user);
    await submit(user);

    const message = await screen.findByText('That email is already registered.');
    expect(message).toBeInTheDocument();
    expect(screen.getByLabelText(/^Email/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows an unreachable server as a message, not a blank page', async () => {
    register.mockRejectedValue(
      new ApiError('INTERNAL', 'We could not reach the server.', 0, undefined),
    );
    const user = userEvent.setup();
    renderPage();
    await fillValidForm(user);
    await submit(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not reach the server.',
    );
  });

  it('asks for a donation date only when there is one to give', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.queryByLabelText(/Date of last donation/)).not.toBeInTheDocument();

    await user.click(screen.getByLabelText(/I have never donated/));
    expect(screen.getByLabelText(/Date of last donation/)).toBeInTheDocument();
  });
});
