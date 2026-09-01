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

/**
 * jsdom answers every media query "no match" (see test/setup.ts), and the form
 * asks whether it has room for a single page — so the untouched default is the
 * phone, in two steps. Each test says which one it is about.
 *
 * Only the min-width query is answered: ThemeProvider asks about
 * prefers-color-scheme through the same function, and a blanket yes would
 * quietly put every desktop test in the dark theme.
 */
function setViewport(kind: 'phone' | 'desktop') {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: kind === 'desktop' && query.includes('min-width'),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

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
  setViewport('desktop');
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

  it('steps a phone back to the field the server rejected, and keeps the message', async () => {
    /*
     * On a phone the email is on step one and the submit button is on step
     * two, so a rejection naming `email` was being written onto an input that
     * was not on screen: the donor sat on step two pressing a button that
     * appeared to do nothing at all. The end-to-end test at 390 found it.
     *
     * The message surviving is the second half, and it is not free. Stepping
     * back moves focus, which blurs the email — and blur re-runs the schema,
     * which is perfectly happy with a well-formed address and used to erase
     * the one sentence explaining why the form would not submit. See the note
     * about external errors in useFieldErrors.
     */
    setViewport('phone');
    register.mockRejectedValue(
      new ApiError('EMAIL_TAKEN', 'That email is already registered.', 409, 'email'),
    );
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/Full name/), 'Ana Petrovska');
    await user.type(screen.getByLabelText(/^Email/), 'ana@example.com');
    await user.type(screen.getByLabelText(/^Password/), 'a-long-enough-password');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(await screen.findByRole('button', { name: 'O negative' }));
    await user.selectOptions(screen.getByLabelText(/City/), 'Skopje');
    await submit(user);

    expect(
      await screen.findByText('That email is already registered.'),
    ).toBeInTheDocument();
    const field = screen.getByLabelText(/^Email/);
    expect(field).toHaveAttribute('aria-invalid', 'true');
    // Focus lands on the problem, not on the step heading above it.
    await waitFor(() => {
      expect(document.activeElement).toBe(field);
    });
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

  it('validates a field when it loses focus, not while it is being typed', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/^Email/), 'not-an-email');
    // Still mid-typing as far as the form is concerned: someone three
    // characters into an address does not need to be told it is wrong.
    expect(screen.queryByText('Enter a valid email address.')).not.toBeInTheDocument();

    await user.tab();
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Email/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('takes the message away again while the field is being fixed', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/^Email/), 'not-an-email');
    await user.tab();
    await screen.findByText('Enter a valid email address.');

    // Not a re-check on the keystroke — the sentence has simply stopped
    // describing what is on screen, and it is checked again on blur.
    await user.type(screen.getByLabelText(/^Email/), '!');
    expect(screen.queryByText('Enter a valid email address.')).not.toBeInTheDocument();
  });

  it('asks for a donation date only when there is one to give', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.queryByLabelText(/Date of last donation/)).not.toBeInTheDocument();

    await user.click(screen.getByLabelText(/I have never donated/));
    expect(screen.getByLabelText(/Date of last donation/)).toBeInTheDocument();
  });
});

describe('on a phone, in two steps', () => {
  beforeEach(() => {
    setViewport('phone');
  });

  it('asks about the person first and the blood second', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByLabelText(/Full name/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/City/)).not.toBeInTheDocument();
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Full name/), 'Ana Petrovska');
    await user.type(screen.getByLabelText(/^Email/), 'ana@example.com');
    await user.type(screen.getByLabelText(/^Password/), 'a-long-enough-password');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByLabelText(/City/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Full name/)).not.toBeInTheDocument();
    expect(screen.getByText('Step 2 of 2')).toBeInTheDocument();
  });

  it('will not move on with the first step incomplete', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Enter your full name.')).toBeInTheDocument();
    expect(screen.queryByLabelText(/City/)).not.toBeInTheDocument();
  });

  it('reports the whole step at once, and nothing beyond it', async () => {
    /* Every required field on this step, so the donor fixes them in one pass
       — and only this step's, because being told the blood type is missing on
       a screen that does not ask for it is a dead end. Name, email and
       password; phone is optional. */
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText('Enter your full name.');

    expect(screen.getByLabelText(/Full name/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/^Email/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute('aria-invalid', 'true');
    expect(document.querySelectorAll('[aria-invalid="true"]')).toHaveLength(3);
  });

  it('moves focus to the step it has just opened', async () => {
    /* So a screen reader says where it now is, rather than leaving the user
       on a Continue button that has been unmounted. The guard on this used a
       "have I mounted" ref, which survives StrictMode's remount — so the
       heading took focus on page load instead, putting the first Tab past
       the skip link and the entire header. */
    const user = userEvent.setup();
    renderPage();

    // Nothing on the page has taken focus. Asserting on activeElement's text
    // would match the whole body, which contains every heading there is.
    expect(document.activeElement).toBe(document.body);

    await user.type(screen.getByLabelText(/Full name/), 'Ana Petrovska');
    await user.type(screen.getByLabelText(/^Email/), 'ana@example.com');
    await user.type(screen.getByLabelText(/^Password/), 'a-long-enough-password');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(document.activeElement).toHaveTextContent('Your blood');
    });
  });

  it('keeps what was typed when stepping back and forward', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/Full name/), 'Ana Petrovska');
    await user.type(screen.getByLabelText(/^Email/), 'ana@example.com');
    await user.type(screen.getByLabelText(/^Password/), 'a-long-enough-password');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await user.click(await screen.findByRole('button', { name: 'Back' }));
    expect(await screen.findByLabelText(/Full name/)).toHaveValue('Ana Petrovska');
  });

  it('registers from the second step', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/Full name/), 'Ana Petrovska');
    await user.type(screen.getByLabelText(/^Email/), 'ana@example.com');
    await user.type(screen.getByLabelText(/^Password/), 'a-long-enough-password');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await user.click(await screen.findByRole('button', { name: 'O negative' }));
    await user.selectOptions(screen.getByLabelText(/City/), 'Skopje');
    await user.click(screen.getByRole('button', { name: /Register as donor/ }));

    await waitFor(() => {
      expect(register).toHaveBeenCalledTimes(1);
    });
    expect(register.mock.calls[0]?.[0]).toMatchObject({
      fullName: 'Ana Petrovska',
      email: 'ana@example.com',
      bloodType: 'O-',
      city: 'Skopje',
    });
  });
});
