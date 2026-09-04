import { useEffect, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DonorNotification, DonorProfilePatchInput } from '@kapka/shared';
import { ToastProvider } from '../components';
import { SessionProvider } from '../lib/SessionProvider';
import { useSession } from '../lib/session';
import { ApiError, type DonorProfile, type Me, type Session } from '../lib/api';
import Dashboard from './Dashboard';

const getMe = vi.fn<(token: string) => Promise<Me>>();
const exportMyData = vi.fn<(token: string) => Promise<unknown>>();
const deleteMyAccount = vi.fn<(password: string, token: string) => Promise<void>>();
const listMyNotifications = vi.fn<(token: string) => Promise<DonorNotification[]>>();
const updateDonorProfile =
  vi.fn<(patch: DonorProfilePatchInput, token: string) => Promise<DonorProfile>>();
const resendVerification =
  vi.fn<(token: string) => Promise<{ emailVerified: boolean }>>();

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    api: {
      getMe: (token: string) => getMe(token),
      listMyNotifications: (token: string) => listMyNotifications(token),
      exportMyData: (token: string) => exportMyData(token),
      deleteMyAccount: (password: string, token: string) =>
        deleteMyAccount(password, token),
      updateDonorProfile: (patch: DonorProfilePatchInput, token: string) =>
        updateDonorProfile(patch, token),
      resendVerification: (token: string) => resendVerification(token),
      /* The profile picture is the AvatarPicker's business and has its own
         tests; this page only has to keep working while it says there is
         none. */
      getAvatar: () => Promise.resolve(null),
      setAvatar: () => Promise.resolve(),
      removeAvatar: () => Promise.resolve(),
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
    hasDonorProfile: true,
  },
  accessToken: 'token',
};

const me = (profile: DonorProfile | null = PROFILE): Me => ({
  user: SESSION.user,
  donorProfile: profile,
});

/** The same account, with the confirmation link still unopened. */
const unconfirmed = (): Me => ({
  user: { ...SESSION.user, emailVerified: false },
  donorProfile: PROFILE,
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
      <SessionProvider>
        {/* Mirrors App.tsx. The screen reports a finished export through a
              toast, and useToast refuses to work without its provider rather
              than dropping messages silently. */}
        <ToastProvider>
          {signedIn ? (
            <SignedIn>
              <Dashboard />
            </SignedIn>
          ) : (
            <Dashboard />
          )}
        </ToastProvider>
      </SessionProvider>
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

/** The city control is a listbox we draw, not a <select> — see Picker. */
async function pickCity(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('combobox', { name: /City/ }));
  await user.click(screen.getByRole('option', { name }));
}

beforeEach(() => {
  exportMyData.mockReset();
  exportMyData.mockResolvedValue({ exportedAt: '2026-09-01T00:00:00.000Z', account: {} });
  deleteMyAccount.mockReset();
  deleteMyAccount.mockResolvedValue(undefined);
  listMyNotifications.mockReset();
  listMyNotifications.mockResolvedValue([]);
  getMe.mockReset();
  updateDonorProfile.mockReset();
  resendVerification.mockReset();
  resendVerification.mockResolvedValue({ emailVerified: false });
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
    /* A bare day parses as UTC midnight, which formats as the day before west
       of Greenwich. It appears twice by design now — in the status, and beside
       the last donation so the details list does not make you count 56 days
       yourself — so this asks for at least one rather than exactly one. */
    expect(screen.getAllByText(/6 October 2026|October 6, 2026/).length).toBeGreaterThan(
      0,
    );
  });
});

describe('the pause switch', () => {
  it('pauses without deleting anything', async () => {
    // §3: without this, stopping the emails means deleting the account.
    const user = userEvent.setup();
    renderDashboard();
    await user.click(await screen.findByRole('button', { name: /Pause my emails/ }));

    await waitFor(() => {
      /* Both, not just availability: the matching query requires both and
         this card's copy has always been about email. Writing one left the
         donor half paused. */
      expect(updateDonorProfile).toHaveBeenCalledWith(
        { isAvailable: false, notifyByEmail: false },
        'token',
      );
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
      expect(updateDonorProfile).toHaveBeenCalledWith(
        { isAvailable: true, notifyByEmail: true },
        'token',
      );
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
    // Still eligible, and still one status saying so.
    expect(screen.getByText('You can give today')).toBeInTheDocument();
  });
});

describe('editing the profile', () => {
  it('sends only what changed', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await user.click(await screen.findByRole('button', { name: /Edit details/ }));
    await pickCity(user, 'Bitola');
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
    /* One sentence over a drawing. It used to be a paragraph re-explaining
       the matching rules and naming the city for the fourth time on the
       page. */
    renderDashboard();
    expect(
      await screen.findByText('No requests have reached you yet.'),
    ).toBeInTheDocument();
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

describe('taking your data, and leaving', () => {
  it('does not delete anything on the first click', async () => {
    /* Irreversible, and it takes the requests they posted with it. The
       confirmation is a real dialog, so the browser traps focus in it. */
    const user = userEvent.setup();
    renderDashboard();
    await user.click(await screen.findByRole('button', { name: /Delete my account/ }));

    expect(deleteMyAccount).not.toHaveBeenCalled();
    expect(
      await screen.findByRole('dialog', { name: /Delete your account\?/ }),
    ).toBeInTheDocument();
  });

  it('says what goes and what stays before asking', async () => {
    // Somebody deleting an account should not be surprised afterwards.
    const user = userEvent.setup();
    renderDashboard();
    await user.click(await screen.findByRole('button', { name: /Delete my account/ }));

    const dialog = screen.getByRole('dialog');
    // What goes: the account, the details, the requests, the phone on them.
    expect(within(dialog).getByText(/removes your account/)).toBeInTheDocument();
    expect(within(dialog).getByText(/phone number on them/)).toBeInTheDocument();
    // What stays, and why it is not a loophole.
    expect(within(dialog).getByText(/with your name taken off it/)).toBeInTheDocument();
  });

  it('asks for the password and sends it', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await user.click(await screen.findByRole('button', { name: /Delete my account/ }));
    await user.type(screen.getByLabelText(/Your password/), 'a-long-enough-password');
    await user.click(screen.getByRole('button', { name: /Delete everything/ }));

    await waitFor(() => {
      expect(deleteMyAccount).toHaveBeenCalledWith('a-long-enough-password', 'token');
    });
  });

  it('keeps the account when the password is wrong', async () => {
    deleteMyAccount.mockRejectedValue(
      new ApiError('INVALID_CREDENTIALS', 'That password is not right.', 401, 'password'),
    );
    const user = userEvent.setup();
    renderDashboard();
    await user.click(await screen.findByRole('button', { name: /Delete my account/ }));
    await user.type(screen.getByLabelText(/Your password/), 'wrong');
    await user.click(screen.getByRole('button', { name: /Delete everything/ }));

    expect(await screen.findByText('That password is not right.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('lets somebody back out', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await user.click(await screen.findByRole('button', { name: /Delete my account/ }));
    await user.click(screen.getByRole('button', { name: /Keep my account/ }));

    expect(deleteMyAccount).not.toHaveBeenCalled();
  });

  it('asks the API for the export when the data is downloaded', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await user.click(await screen.findByRole('button', { name: /^Download$/ }));

    await waitFor(() => {
      expect(exportMyData).toHaveBeenCalledWith('token');
    });
  });
});

describe('who the profile belongs to', () => {
  it('says whose account this is', async () => {
    /* The page listed settings and never once named the person they belong
       to — which is most of what a profile is. */
    renderDashboard();
    /* Twice over: the header's avatar link carries it too, and that link is
       how a phone gets here at all. */
    expect(await screen.findAllByText('Ana Petrovska')).not.toHaveLength(0);
    expect(screen.getByText('ana@example.com')).toBeInTheDocument();
    expect(screen.getByText('Donor account')).toBeInTheDocument();
  });

  it('says nothing is coming while the email is unconfirmed, and offers the link again', async () => {
    /*
     * The matching query refuses an unconfirmed donor, so this account is
     * complete on screen and unreachable in practice. Before this, the only
     * screen that said so was the one shown in the minute after registering.
     */
    const user = userEvent.setup();
    getMe.mockResolvedValue(unconfirmed());
    renderDashboard();

    /* One status element, not a chip and a block and a card that could
       disagree — the resolver puts this above everything else because
       nothing is sent to an unconfirmed address. */
    expect(
      await screen.findByText('Confirm your email to be matched'),
    ).toBeInTheDocument();
    // And the state it contradicted is not also on screen.
    expect(screen.queryByText('You can give today')).toBeNull();

    await user.click(screen.getByRole('button', { name: /Resend confirmation link/ }));

    await waitFor(() => {
      expect(resendVerification).toHaveBeenCalledWith('token');
    });
  });

  it('does not offer a confirmation link to somebody who has used theirs', async () => {
    renderDashboard();
    expect(await screen.findByText('You can give today')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Resend confirmation link/ })).toBeNull();
  });

  it('still names a requester, who has no donor settings to show', async () => {
    getMe.mockResolvedValue({
      user: { ...SESSION.user, role: 'requester' },
      donorProfile: null,
    });
    renderDashboard();

    expect(await screen.findByText('Requester account')).toBeInTheDocument();
    expect(screen.getByText('This account is not a donor')).toBeInTheDocument();
  });
});
