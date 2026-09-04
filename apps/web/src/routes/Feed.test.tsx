import { useEffect, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicBloodRequest, UserRole } from '@kapka/shared';
import { SessionProvider } from '../lib/SessionProvider';
import { ApiError, type Session } from '../lib/api';
import { useSession } from '../lib/session';
import Feed from './Feed';

const listRequests = vi.fn<() => Promise<PublicBloodRequest[]>>();
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, api: { listRequests: () => listRequests() } };
});

const at = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const request = (over: Partial<PublicBloodRequest>): PublicBloodRequest => ({
  id: 'r1',
  bloodType: 'O-',
  unitsNeeded: 2,
  urgency: 'routine',
  hospitalName: 'City General',
  city: 'Skopje',
  note: null,
  status: 'approved',
  createdAt: at(30),
  expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  ...over,
});

const REQUESTS = [
  request({ id: 'r1', urgency: 'routine', bloodType: 'A+', city: 'Bitola' }),
  request({
    id: 'r2',
    urgency: 'critical',
    bloodType: 'O-',
    city: 'Skopje',
    hospitalName: 'Mother Teresa',
    createdAt: at(5),
  }),
  request({ id: 'r3', urgency: 'urgent', bloodType: 'B-', city: 'Skopje' }),
];

const sessionAs = (role: UserRole): Session => ({
  user: {
    id: 'u1',
    email: 'donor@example.com',
    fullName: 'Ana Donor',
    role,
    emailVerified: true,
    hasDonorProfile: true,
  },
  accessToken: 'token',
});

function SignedIn({ as, children }: { as: UserRole; children: ReactNode }) {
  const { session, signIn } = useSession();
  useEffect(() => {
    signIn(sessionAs(as));
  }, [as, signIn]);
  return session ? <>{children}</> : null;
}

const renderFeed = ({ as }: { as?: UserRole } = {}) =>
  render(
    <MemoryRouter>
      <SessionProvider>
        {as ? (
          <SignedIn as={as}>
            <Feed />
          </SignedIn>
        ) : (
          <Feed />
        )}
      </SessionProvider>
    </MemoryRouter>,
  );

/** The city control is a listbox we draw, not a <select> — see Picker. */
async function pickCity(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('combobox', { name: /Location/ }));
  await user.click(screen.getByRole('option', { name }));
}

beforeEach(() => {
  listRequests.mockReset();
  listRequests.mockResolvedValue(REQUESTS);
});

describe('the public feed', () => {
  it('links every card to its own request', async () => {
    renderFeed();
    const card = await screen.findByRole('link', { name: /Mother Teresa/ });
    expect(card).toHaveAttribute('href', '/requests/r2');
  });

  it('puts the most urgent request first', async () => {
    // Someone scanning this in a hurry should not be reading whatever order
    // the database happened to return.
    renderFeed();
    await screen.findByText('3 open requests');
    /* Scoped to the list: the page above it has its own h3s now — the three
       steps of how this works — and they are not requests. */
    const list = screen.getByRole('region', { name: 'Requests' });
    const headings = within(list).getAllByRole('heading', { level: 3 });
    expect(headings[0]).toHaveTextContent('Mother Teresa');
  });

  it('offers registering as a link, not a dead button', async () => {
    renderFeed();
    await screen.findByText('3 open requests');
    for (const link of screen.getAllByRole('link', { name: /Register as donor/ })) {
      expect(link).toHaveAttribute('href', '/register');
    }
  });

  it('filters by city', async () => {
    const user = userEvent.setup();
    renderFeed();
    await screen.findByText('3 open requests');

    await pickCity(user, 'Bitola');
    await waitFor(() => {
      expect(screen.getByText('1 open request')).toBeInTheDocument();
    });
    expect(screen.queryByText('Mother Teresa')).not.toBeInTheDocument();
  });

  it('filters by urgency, and says so in the singular', async () => {
    const user = userEvent.setup();
    renderFeed();
    await screen.findByText('3 open requests');

    await user.click(screen.getByRole('button', { name: 'Critical' }));
    expect(await screen.findByText('1 open request')).toBeInTheDocument();
  });

  it('offers a way back when the filters match nothing', async () => {
    const user = userEvent.setup();
    renderFeed();
    await screen.findByText('3 open requests');

    await user.click(screen.getByRole('button', { name: 'Critical' }));
    await pickCity(user, 'Bitola');

    const empty = await screen.findByText(/No requests match these filters/);
    expect(empty).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Clear filters/ }));
    expect(await screen.findByText('3 open requests')).toBeInTheDocument();
  });

  it('counts the whole feed in the stat strip, not the filtered view', async () => {
    const user = userEvent.setup();
    renderFeed();
    const strip = (await screen.findByText('Open requests')).closest('dl');
    if (!strip) throw new Error('no stat strip');

    /* 3 open, 1 critical, 2 cities — awaited, because the strip counts up to
       them. Under the reduced motion the test environment asks for (see
       setup.ts) that is one state update rather than a second of frames, but
       it is still a state update, and it lands after the list has rendered. */
    await waitFor(() => {
      expect(within(strip).getByText('3')).toBeInTheDocument();
      expect(within(strip).getByText('1')).toBeInTheDocument();
      expect(within(strip).getByText('2')).toBeInTheDocument();
    });

    // Narrowing the list must not change what the strip reports: it
    // describes what is open, and a filter is the reader's own view of it.
    await user.click(screen.getByRole('button', { name: 'Critical' }));
    await screen.findByText('1 open request');
    expect(within(strip).getByText('3')).toBeInTheDocument();
  });

  it('offers the cities that actually have requests, with their counts', async () => {
    /* Drawn from the same list as the cards, so the two cannot disagree —
       and it answers the question that section is asking, which is where
       this is happening rather than how much of it there is. */
    renderFeed();
    await screen.findByText('3 open requests');

    // Two in Skopje, one in Bitola; the fixture has no others.
    expect(
      screen.getByRole('button', { name: 'Skopje, 2 open requests, 1 critical' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Bitola, 1 open request' }),
    ).toBeInTheDocument();
  });

  it('says which cities have something critical in them, in words', async () => {
    // Never colour alone (§10): the chip is outlined AND it says so.
    renderFeed();
    await screen.findByText('3 open requests');
    expect(
      screen.getByRole('button', { name: /Skopje, 2 open requests, 1 critical/ }),
    ).toBeInTheDocument();
  });

  it('filters the list to the city that was pressed', async () => {
    const user = userEvent.setup();
    renderFeed();
    await screen.findByText('3 open requests');

    await user.click(screen.getByRole('button', { name: /^Bitola/ }));
    expect(await screen.findByText('1 open request')).toBeInTheDocument();
  });

  it('puts every filter on screen, behind no toggle', async () => {
    /* The chips used to fold away behind a "Filters" button on a phone. They
       are a scrolling strip now, so there is nothing to open — and a filter
       nobody can see is a filter nobody uses. */
    renderFeed();
    await screen.findByText('3 open requests');

    expect(screen.queryByRole('button', { name: /^Filters/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Critical' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'O negative' })).toBeInTheDocument();
    expect(screen.getByLabelText('Location')).toBeInTheDocument();
  });

  it('names each set of chips for a screen reader', async () => {
    // Eleven toggle buttons in a row need saying which is which. The chips
    // themselves are only "Critical" or "O negative".
    renderFeed();
    await screen.findByText('3 open requests');

    const urgency = screen.getByRole('group', { name: 'Filter by urgency' });
    expect(within(urgency).getByRole('button', { name: 'Routine' })).toBeInTheDocument();

    const types = screen.getByRole('group', { name: 'Filter by blood type' });
    expect(
      within(types).getByRole('button', { name: 'A B positive' }),
    ).toBeInTheDocument();
  });

  it('keeps the filters in their own labelled region beside the list', async () => {
    /* The rail at 64rem and the strip below it are the same element — this is
       the part of that arrangement a test can actually hold down. */
    renderFeed();
    await screen.findByText('3 open requests');

    const filters = screen.getByRole('complementary', { name: 'Filter requests' });
    expect(within(filters).getByLabelText('Location')).toBeInTheDocument();
    // The cards are not inside it.
    expect(within(filters).queryByRole('link', { name: /Mother Teresa/ })).toBeNull();
  });

  it('shows a retry when the list cannot be loaded', async () => {
    listRequests.mockRejectedValue(
      new ApiError('INTERNAL', 'We could not reach the server.', 0, undefined),
    );
    renderFeed();
    expect(await screen.findByText(/couldn’t load the requests/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument();
  });

  it('tells a reader with no signal that it is their connection', async () => {
    /* Someone standing in a hospital corridor with no bars is not helped by
       being told the server is unreachable — and there is no button that
       would fix it, so they are not offered one. */
    listRequests.mockRejectedValue(new ApiError('OFFLINE', 'You are offline.', 0));
    renderFeed();

    expect(await screen.findByText('You are offline')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Try again/ })).toBeNull();
  });

  it('loads itself when the connection comes back', async () => {
    /* A screen that failed while the device had no signal fixes itself. The
       alternative is a reader looking at an error, having done nothing
       wrong, on a page that would load perfectly well by now. */
    listRequests.mockRejectedValueOnce(new ApiError('OFFLINE', 'You are offline.', 0));
    renderFeed();
    await screen.findByText('You are offline');

    listRequests.mockResolvedValue(REQUESTS);
    window.dispatchEvent(new Event('online'));

    expect(await screen.findByText('3 open requests')).toBeInTheDocument();
  });

  it('says something useful when nothing is open', async () => {
    listRequests.mockResolvedValue([]);
    renderFeed();
    expect(await screen.findByText(/No open requests right now/)).toBeInTheDocument();
  });

  it('stops asking a donor to register', async () => {
    /* The bug this replaces: a signed-in donor read the hero, the sticky
       thumb-zone bar and the empty state all inviting them to join a list
       they are already on, and the form behind them can only refuse an
       address that already has an account. */
    renderFeed({ as: 'donor' });
    await screen.findByText('3 open requests');

    expect(screen.queryByRole('link', { name: /Register as donor/ })).toBeNull();
    /* Two of them by design: the hero's action and the header's avatar, which
       is the only way to your own profile on a phone. */
    for (const link of screen.getAllByRole('link', { name: /Your profile/ })) {
      expect(link).toHaveAttribute('href', '/me');
    }
  });

  it('offers a requester the thing they can actually do', async () => {
    /* Registering makes a new account rather than adding a donor profile to
       this one, so it is not an action this reader has. */
    renderFeed({ as: 'requester' });
    await screen.findByText('3 open requests');

    expect(screen.queryByRole('link', { name: /Register as donor/ })).toBeNull();
    expect(screen.getAllByRole('link', { name: /Post a request/ })[0]).toHaveAttribute(
      'href',
      '/requests/new',
    );
  });

  it('keeps the invitation for a reader with no account', async () => {
    renderFeed();
    await screen.findByText('3 open requests');
    expect(
      screen.getAllByRole('link', { name: /Register as donor/ }).length,
    ).toBeGreaterThan(1);
  });
});
