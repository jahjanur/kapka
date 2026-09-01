import { useEffect, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DonorNotification, DonorProfilePatchInput } from '@kapka/shared';
import { ThemeProvider } from '../lib/ThemeProvider';
import { SessionProvider } from '../lib/SessionProvider';
import { useSession } from '../lib/session';
import { ApiError, type DonorProfile, type Me, type Session } from '../lib/api';
import Dashboard from './Dashboard';

const getMe = vi.fn<(token: string) => Promise<Me>>();
const listMyNotifications = vi.fn<(token: string) => Promise<DonorNotification[]>>();
const updateDonorProfile =
  vi.fn<(patch: DonorProfilePatchInput, token: string) => Promise<DonorProfile>>();

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    api: {
      getMe: (token: string) => getMe(token),
      listMyNotifications: (token: string) => listMyNotifications(token),
      updateDonorProfile: (patch: DonorProfilePatchInput, token: string) =>
        updateDonorProfile(patch, token),
    },
  };
});

const PROFILE: DonorProfile = {
  bloodType: 'O-',
  city: 'Skopje',
  lastDonationDate: null,
  isAvailable: true,
  notifyByEmail: true,
  eligibleFrom: null,
};

const SESSION: Session = {
  user: {
    id: 'u1',
    email: 'ana@example.com',
    fullName: 'Ana Petrovska',
    role: 'donor',
    emailVerified: true,
  },
  accessToken: 'token',
};

const me = (profile: DonorProfile | null = PROFILE): Me => ({
  user: SESSION.user,
  donorProfile: profile,
});

function SignedIn({ children }: { children: ReactNode }) {
  const { session, signIn } = useSession();
  useEffect(() => {
    signIn(SESSION);
  }, [signIn]);
  return session ? <>{children}</> : null;
}

function renderDashboard({ signedIn = true } = {}) {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <SessionProvider>
          {signedIn ? (
            <SignedIn>
              <Dashboard />
            </SignedIn>
          ) : (
            <Dashboard />
          )}
        </SessionProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

const notification = (over: Partial<DonorNotification> = {}): DonorNotification => ({
  requestId: 'r1',
  bloodType: 'O-',
  urgency: 'critical',
  hospitalName: 'City General',
  city: 'Skopje',
  requestStatus: 'approved',
  status: 'sent',
  createdAt: new Date(Date.now() - 60 * 60_000).toISOString(),
  sentAt: new Date(Date.now() - 60 * 60_000).toISOString(),
  ...over,
});

beforeEach(() => {
  listMyNotifications.mockReset();
  listMyNotifications.mockResolvedValue([]);
  getMe.mockReset();
  updateDonorProfile.mockReset();
  getMe.mockResolvedValue(me());
  updateDonorProfile.mockImplementation((patch) =>
    Promise.resolve({ ...PROFILE, ...patch } as DonorProfile),
  );
});

describe('eligibility', () => {
  it('says a donor who has never given can give today', async () => {
    renderDashboard();
    expect(await screen.findByText('You can give today')).toBeInTheDocument();
  });

  it('shows the date the API worked out, and never one of its own', async () => {
    /* §5.2: the database decides. A browser doing this arithmetic is how a
       timezone ends up deciding who may give. */
    getMe.mockResolvedValue(
      me({ ...PROFILE, lastDonationDate: '2026-08-11', eligibleFrom: '2026-10-06' }),
    );
    renderDashboard();

    expect(await screen.findByText('You cannot give just yet')).toBeInTheDocument();
    // A bare day parses as UTC midnight, which formats as the day before
    // west of Greenwich.
    expect(screen.getByText(/6 October 2026|October 6, 2026/)).toBeInTheDocument();
  });
});

describe('the pause switch', () => {
  it('pauses without deleting anything', async () => {
    // §3: without this, stopping the emails means deleting the account.
    const user = userEvent.setup();
    renderDashboard();
    await user.click(await screen.findByRole('button', { name: /Pause my emails/ }));

    await waitFor(() => {
      expect(updateDonorProfile).toHaveBeenCalledWith({ isAvailable: false }, 'token');
    });
    expect(await screen.findByText(/Your emails are paused/)).toBeInTheDocument();
    expect(
      screen.getByText(/account and your details are untouched/),
    ).toBeInTheDocument();
  });

  it('offers the way back once paused', async () => {
    getMe.mockResolvedValue(me({ ...PROFILE, isAvailable: false }));
    const user = userEvent.setup();
    renderDashboard();

    await user.click(
      await screen.findByRole('button', { name: /Start emailing me again/ }),
    );
    await waitFor(() => {
      expect(updateDonorProfile).toHaveBeenCalledWith({ isAvailable: true }, 'token');
    });
  });

  it('keeps the old state when the save fails', async () => {
    updateDonorProfile.mockRejectedValue(
      new ApiError('INTERNAL', 'We could not reach the server.', 0),
    );
    const user = userEvent.setup();
    renderDashboard();
    await user.click(await screen.findByRole('button', { name: /Pause my emails/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach/);
    expect(screen.getByText('You are on the list')).toBeInTheDocument();
  });
});

describe('editing the profile', () => {
  it('sends only what changed', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await user.click(await screen.findByRole('button', { name: /Edit details/ }));
    await user.selectOptions(screen.getByLabelText(/City/), 'Bitola');
    await user.click(screen.getByRole('button', { name: /Save changes/ }));

    await waitFor(() => {
      expect(updateDonorProfile).toHaveBeenCalled();
    });
    expect(updateDonorProfile.mock.calls[0]?.[0]).toMatchObject({
      bloodType: 'O-',
      city: 'Bitola',
      lastDonationDate: null,
    });
  });

  it('records a donation date, and recomputes eligibility from the answer', async () => {
    updateDonorProfile.mockResolvedValue({
      ...PROFILE,
      lastDonationDate: '2026-08-11',
      eligibleFrom: '2026-10-06',
    });
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole('button', { name: /Edit details/ }));
    await user.click(screen.getByLabelText(/I have never donated/));
    await user.type(screen.getByLabelText(/Date of last donation/), '2026-08-11');
    await user.click(screen.getByRole('button', { name: /Save changes/ }));

    // The page shows the server's answer, not one it worked out itself.
    expect(await screen.findByText('You cannot give just yet')).toBeInTheDocument();
  });

  it('warns before a blood type is changed, because everything hangs on it', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await user.click(await screen.findByRole('button', { name: /Edit details/ }));
    expect(screen.getByText(/decides every request you hear about/)).toBeInTheDocument();
  });

  it('leaves without saving when cancelled', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await user.click(await screen.findByRole('button', { name: /Edit details/ }));
    await user.click(screen.getByRole('button', { name: /Cancel/ }));

    expect(updateDonorProfile).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Edit details/ })).toBeInTheDocument();
  });
});

describe('accounts this does not apply to', () => {
  it('asks a signed-out visitor to sign in, and fetches nothing', async () => {
    renderDashboard({ signedIn: false });
    expect(
      await screen.findByText(/Sign in to see your donor settings/),
    ).toBeInTheDocument();
    expect(getMe).not.toHaveBeenCalled();
  });

  it('says plainly when the account has no donor profile', async () => {
    // A requester or an admin. Nothing here applies to them.
    getMe.mockResolvedValue(me(null));
    renderDashboard();
    expect(await screen.findByText(/not a donor/)).toBeInTheDocument();
  });

  it('offers a retry when the settings cannot be loaded', async () => {
    getMe.mockRejectedValue(new ApiError('INTERNAL', 'Nope.', 0));
    renderDashboard();
    expect(await screen.findByText(/couldn’t load your settings/)).toBeInTheDocument();
  });
});

describe('what we have emailed them about', () => {
  it('lists it, and links each one to the request', async () => {
    listMyNotifications.mockResolvedValue([notification()]);
    renderDashboard();

    const link = await screen.findByRole('link', { name: 'City General' });
    expect(link).toHaveAttribute('href', '/requests/r1');
  });

  it('says nothing has been sent, rather than showing an empty box', async () => {
    renderDashboard();
    expect(await screen.findByText(/Nothing yet/)).toBeInTheDocument();
  });

  it('does not call a queued notification sent', async () => {
    /* Beyond the day's ceiling the row is written as queued and goes
       tomorrow (§5.3). Showing it as sent would be a list of emails the
       donor never received, presented as ones they did. */
    listMyNotifications.mockResolvedValue([
      notification({ status: 'queued', sentAt: null }),
    ]);
    renderDashboard();
    expect(await screen.findByText(/Queued — not sent yet/)).toBeInTheDocument();
  });

  it('tells a donor when an email did not reach them', async () => {
    // Actionable: their address may be wrong.
    listMyNotifications.mockResolvedValue([notification({ status: 'failed' })]);
    renderDashboard();
    expect(await screen.findByText(/could not reach you/)).toBeInTheDocument();
  });

  it('says what became of the request, which is what donors ask', async () => {
    listMyNotifications.mockResolvedValue([notification({ requestStatus: 'fulfilled' })]);
    renderDashboard();
    expect(await screen.findByText('Fulfilled')).toBeInTheDocument();
  });

  it('marks nothing on a request that is still open', async () => {
    listMyNotifications.mockResolvedValue([notification()]);
    renderDashboard();
    await screen.findByRole('link', { name: 'City General' });
    expect(screen.queryByText('Fulfilled')).toBeNull();
    expect(screen.queryByText(/Queued|could not reach/)).toBeNull();
  });

  it('asks for nothing when nobody is signed in', async () => {
    renderDashboard({ signedIn: false });
    await screen.findByText(/Sign in to see your donor settings/);
    expect(listMyNotifications).not.toHaveBeenCalled();
  });
});
