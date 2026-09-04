import { useEffect, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModerationQueueItem, UserRole } from '@kapka/shared';
import { SessionProvider } from '../lib/SessionProvider';
import { useSession } from '../lib/session';
import { ApiError, type ApprovalOutcome, type Session } from '../lib/api';
import AdminQueue from './AdminQueue';

const listPendingRequests = vi.fn<(token: string) => Promise<ModerationQueueItem[]>>();
const approveRequest = vi.fn<(id: string, token: string) => Promise<ApprovalOutcome>>();
const rejectRequest =
  vi.fn<(id: string, reason: string, token: string) => Promise<void>>();

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    api: {
      listPendingRequests: (token: string) => listPendingRequests(token),
      approveRequest: (id: string, token: string) => approveRequest(id, token),
      rejectRequest: (id: string, reason: string, token: string) =>
        rejectRequest(id, reason, token),
    },
  };
});

const item = (over: Partial<ModerationQueueItem> = {}): ModerationQueueItem => ({
  id: 'q1',
  bloodType: 'O-',
  unitsNeeded: 2,
  urgency: 'critical',
  hospitalName: 'City General',
  hospitalLat: null,
  hospitalLng: null,
  city: 'Skopje',
  note: 'Road traffic accident.',
  status: 'pending',
  createdAt: new Date(Date.now() - 30 * 60_000).toISOString(),
  expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  contactPhone: '+389 70 000 000',
  requesterName: 'Ana Petrovska',
  matchedDonors: 23,
  ...over,
});

const OUTCOME: ApprovalOutcome = {
  matchedDonors: 23,
  sent: 23,
  failed: 0,
  skipped: 0,
  queued: 0,
  budgetExhausted: false,
  dailyBudgetRemaining: 77,
  warning: null,
};

const sessionAs = (role: UserRole): Session => ({
  user: {
    id: 'u1',
    email: 'admin@example.com',
    fullName: 'Admin Person',
    role,
    emailVerified: true,
    hasDonorProfile: true,
  },
  accessToken: 'admin-token',
});

function SignedIn({ as, children }: { as: UserRole; children: ReactNode }) {
  const { session, signIn } = useSession();
  useEffect(() => {
    signIn(sessionAs(as));
  }, [as, signIn]);
  return session ? <>{children}</> : null;
}

/** jsdom answers every query "no", so the default here is the phone. */
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

function renderQueue({ role }: { role?: UserRole | null } = {}) {
  const as = role === undefined ? 'admin' : role;
  return render(
    <MemoryRouter>
      <SessionProvider>
        {as ? (
          <SignedIn as={as}>
            <AdminQueue />
          </SignedIn>
        ) : (
          <AdminQueue />
        )}
      </SessionProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  setViewport('desktop');
  listPendingRequests.mockReset();
  approveRequest.mockReset();
  rejectRequest.mockReset();
  listPendingRequests.mockResolvedValue([item()]);
  approveRequest.mockResolvedValue(OUTCOME);
  rejectRequest.mockResolvedValue(undefined);
});

describe('who can open the queue', () => {
  it('turns away a donor without asking the API for anything', async () => {
    // Access control lives in the API, which refuses them regardless. This is
    // about not wasting their time, and not fetching a list they cannot see.
    renderQueue({ role: 'donor' });
    expect(await screen.findByText(/for administrators/i)).toBeInTheDocument();
    expect(listPendingRequests).not.toHaveBeenCalled();
  });

  it('turns away a signed-out visitor', async () => {
    renderQueue({ role: null });
    expect(await screen.findByText(/for administrators/i)).toBeInTheDocument();
    expect(listPendingRequests).not.toHaveBeenCalled();
  });
});

describe('working through the queue', () => {
  it('shows what is waiting, and how far approving would reach', async () => {
    /* §9.6: the number goes in front of the admin BEFORE they confirm.
       Approving is irreversible and emails strangers. */
    renderQueue();
    await screen.findByRole('button', { name: 'City General' });
    await userEvent.setup().click(screen.getByRole('button', { name: 'City General' }));

    expect(
      screen.getByText(/Approving emails 23 donors immediately/),
    ).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/)).toBeInTheDocument();
  });

  it('shows the requester and their number, which is why this page is gated', async () => {
    const user = userEvent.setup();
    renderQueue();
    await user.click(await screen.findByRole('button', { name: 'City General' }));

    const drawer = screen.getByRole('complementary', { name: 'Request detail' });
    expect(within(drawer).getByText('Ana Petrovska')).toBeInTheDocument();
    expect(within(drawer).getByText('+389 70 000 000')).toBeInTheDocument();
  });

  it('approves, reports what was actually sent, and drops the row', async () => {
    const user = userEvent.setup();
    renderQueue();
    await user.click(await screen.findByRole('button', { name: 'City General' }));
    await user.click(screen.getByRole('button', { name: /Approve and notify/ }));
    await user.click(screen.getByRole('button', { name: /Yes, email 23 donors/ }));

    await waitFor(() => {
      expect(approveRequest).toHaveBeenCalledWith('q1', 'admin-token');
    });
    // Not a bare success toast (§9.6).
    expect(await screen.findByText(/23 of 23 emailed/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'City General' })).toBeNull();
  });

  it('sends nothing on the first click — the count is a gate, not a caption', async () => {
    /* This used to be one click that emailed strangers and could not be taken
       back. The number was on the screen; nothing made anyone read it. */
    const user = userEvent.setup();
    renderQueue();
    await user.click(await screen.findByRole('button', { name: 'City General' }));
    await user.click(screen.getByRole('button', { name: /Approve and notify/ }));

    expect(approveRequest).not.toHaveBeenCalled();
    expect(await screen.findByText('Email 23 donors now?')).toBeInTheDocument();
  });

  it('names the number in the button that does the sending', async () => {
    // Whatever else is skimmed, the control being clicked says what it does.
    const user = userEvent.setup();
    renderQueue();
    await user.click(await screen.findByRole('button', { name: 'City General' }));
    await user.click(screen.getByRole('button', { name: /Approve and notify/ }));

    expect(
      screen.getByRole('button', { name: /Yes, email 23 donors/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/23 donors in Skopje will be emailed about/),
    ).toBeInTheDocument();
  });

  it('lets the admin back out without sending', async () => {
    const user = userEvent.setup();
    renderQueue();
    await user.click(await screen.findByRole('button', { name: 'City General' }));
    await user.click(screen.getByRole('button', { name: /Approve and notify/ }));
    await user.click(screen.getByRole('button', { name: /Cancel/ }));

    expect(approveRequest).not.toHaveBeenCalled();
    expect(screen.queryByText('Email 23 donors now?')).toBeNull();
    expect(
      screen.getByRole('button', { name: /Approve and notify/ }),
    ).toBeInTheDocument();
  });

  it('does not promise emails it will not send when nobody matches', async () => {
    /* Approving with no matches is still valid — it publishes the request to
       the feed — but "email nobody now?" would be nonsense. */
    listPendingRequests.mockResolvedValue([item({ matchedDonors: 0 })]);
    const user = userEvent.setup();
    renderQueue();
    await user.click(await screen.findByRole('button', { name: 'City General' }));
    await user.click(screen.getByRole('button', { name: /Approve and notify/ }));

    expect(screen.getByText('Approve without emailing anyone?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Approve without emailing/ }));
    await waitFor(() => {
      expect(approveRequest).toHaveBeenCalled();
    });
  });

  it('moves focus to the confirmation, so it is not missed', async () => {
    // A panel that appears silently below the button is one a screen-reader
    // user does not know is there.
    const user = userEvent.setup();
    renderQueue();
    await user.click(await screen.findByRole('button', { name: 'City General' }));
    await user.click(screen.getByRole('button', { name: /Approve and notify/ }));

    await waitFor(() => {
      expect(document.activeElement).toHaveTextContent('Email 23 donors now?');
    });
  });

  it('puts a budget shortfall where it cannot be missed', async () => {
    // Silently dropping emails is the worst failure mode here (§5.3).
    approveRequest.mockResolvedValue({
      ...OUTCOME,
      sent: 12,
      queued: 11,
      budgetExhausted: true,
      warning: "Today's email budget is spent: 11 donors are queued for tomorrow.",
    });
    const user = userEvent.setup();
    renderQueue();
    await user.click(await screen.findByRole('button', { name: 'City General' }));
    await user.click(screen.getByRole('button', { name: /Approve and notify/ }));
    await user.click(screen.getByRole('button', { name: /Yes, email 23 donors/ }));

    expect(await screen.findByText(/queued for tomorrow/)).toBeInTheDocument();
  });

  it('asks for a reason before rejecting, and sends it', async () => {
    const user = userEvent.setup();
    renderQueue();
    await user.click(await screen.findByRole('button', { name: 'City General' }));
    await user.click(screen.getByRole('button', { name: /^Reject$/ }));

    await user.type(screen.getByLabelText(/Why is this being rejected/), 'Duplicate.');
    await user.click(screen.getByRole('button', { name: /Confirm rejection/ }));

    await waitFor(() => {
      expect(rejectRequest).toHaveBeenCalledWith('q1', 'Duplicate.', 'admin-token');
    });
  });

  it('keeps the row when the decision does not go through', async () => {
    // Two admins working the queue at once land here.
    approveRequest.mockRejectedValue(
      new ApiError('ALREADY_MODERATED', 'That request was already approved.', 409),
    );
    const user = userEvent.setup();
    renderQueue();
    await user.click(await screen.findByRole('button', { name: 'City General' }));
    await user.click(screen.getByRole('button', { name: /Approve and notify/ }));
    await user.click(screen.getByRole('button', { name: /Yes, email 23 donors/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/already approved/);
    expect(screen.getByRole('button', { name: 'City General' })).toBeInTheDocument();
  });

  it('says so when there is nothing waiting', async () => {
    listPendingRequests.mockResolvedValue([]);
    renderQueue();
    expect(await screen.findByText(/Nothing is waiting/)).toBeInTheDocument();
  });

  it('offers a retry when the queue cannot be loaded', async () => {
    listPendingRequests.mockRejectedValue(
      new ApiError('INTERNAL', 'We could not reach the server.', 0),
    );
    renderQueue();
    expect(await screen.findByText(/couldn’t load the queue/)).toBeInTheDocument();
  });
});

describe('on a phone', () => {
  beforeEach(() => {
    setViewport('phone');
  });

  it('renders no table at all, which is how there is no sideways scroll', async () => {
    /* §7.1 puts 360px as the floor with no horizontal scroll. Eight columns
       do not fit, and an overflow box around a table is a scroll bar, not a
       solution — so the table is not rendered here in the first place. */
    renderQueue();
    await screen.findByText('City General');
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('puts everything a decision needs on the card, with no drawer to open', async () => {
    renderQueue();
    await screen.findByText('City General');

    expect(screen.queryByRole('complementary', { name: 'Request detail' })).toBeNull();
    expect(screen.getByText('Ana Petrovska')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Approve and notify/ }),
    ).toBeInTheDocument();
  });
});
