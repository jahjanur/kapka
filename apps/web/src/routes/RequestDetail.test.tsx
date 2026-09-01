import { useEffect, type ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicBloodRequest } from '@kapka/shared';
import { ThemeProvider } from '../lib/ThemeProvider';
import { SessionProvider } from '../lib/SessionProvider';
import { useSession } from '../lib/session';
import { ApiError, type Session, type ViewedRequest } from '../lib/api';
import RequestDetail from './RequestDetail';

const getRequest = vi.fn<(id: string, token?: string) => Promise<ViewedRequest>>();
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    api: { getRequest: (id: string, token?: string) => getRequest(id, token) },
  };
});

/* Leaflet needs real layout and jsdom has none. What matters here is whether
   the map is asked for at all, which the stub answers. */
vi.mock('../components/HospitalMap/HospitalMap', () => ({
  default: ({ lat, lng }: { lat: number | null; lng: number | null }) => (
    <div>{`stub map ${String(lat)},${String(lng)}`}</div>
  ),
}));

const SESSION: Session = {
  user: {
    id: 'u1',
    email: 'ana@example.com',
    fullName: 'Ana Petrovska',
    role: 'donor',
    emailVerified: true,
  },
  accessToken: 'access-token',
};

function SignedIn({ children }: { children: ReactNode }) {
  const { session, signIn } = useSession();
  useEffect(() => {
    signIn(SESSION);
  }, [signIn]);
  return session ? <>{children}</> : null;
}

const REQUEST: PublicBloodRequest = {
  id: 'r2',
  bloodType: 'O-',
  unitsNeeded: 3,
  urgency: 'critical',
  hospitalName: 'City General Hospital',
  city: 'Skopje',
  note: 'Road traffic accident, theatre is prepped.',
  status: 'approved',
  createdAt: new Date(Date.now() - 12 * 60_000).toISOString(),
  expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
};

const renderAt = (id = 'r2', { signedIn = false } = {}) => {
  const screenEl = (
    <Routes>
      <Route path="/requests/:id" element={<RequestDetail />} />
    </Routes>
  );
  return render(
    <MemoryRouter initialEntries={[`/requests/${id}`]}>
      <ThemeProvider>
        <SessionProvider>
          {signedIn ? <SignedIn>{screenEl}</SignedIn> : screenEl}
        </SessionProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
};

beforeEach(() => {
  getRequest.mockReset();
  getRequest.mockResolvedValue(REQUEST);
});

describe('one request in full', () => {
  it('asks for the request in the URL, with no token when signed out', async () => {
    renderAt('r2');
    await screen.findByText('City General Hospital, Skopje');
    // The second argument is the access token. Absent here on purpose: this
    // page is public, and an anonymous fetch is what hides the contact
    // number at the source rather than in the markup.
    expect(getRequest).toHaveBeenCalledWith('r2', undefined);
  });

  it('shows what a donor needs to decide', async () => {
    const { container } = renderAt();
    await screen.findByText('City General Hospital, Skopje');

    expect(container.textContent).toContain('O−');
    expect(container.textContent).toMatch(/critical/i);
    expect(container.textContent).toContain('3');
    expect(container.textContent).toContain('Road traffic accident, theatre is prepped.');
  });

  it('announces the blood type in words, not as a glyph', async () => {
    const { container } = renderAt();
    await screen.findByText('City General Hospital, Skopje');
    expect(container.textContent).toContain('O negative');
  });

  it('offers registering, which is the only thing a stranger can do here', async () => {
    renderAt();
    await screen.findByText('City General Hospital, Skopje');
    // Two of them — the header and the action rail — and neither may be a
    // button that goes nowhere.
    const links = screen.getAllByRole('link', { name: /Register as donor/ });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link).toHaveAttribute('href', '/register');
  });

  it('never shows contact details to a signed-out visitor', async () => {
    // §12: contact is not on the public feed, and this page is public.
    const { container } = renderAt();
    await screen.findByText('City General Hospital, Skopje');
    expect(container.textContent).toMatch(/Hidden while you are signed out/);
    expect(container.textContent).not.toMatch(/\+389|07\d{7}/);
  });

  it('offers directions without needing an account', async () => {
    // Getting there needs an address, not a session.
    renderAt();
    const link = await screen.findByRole('link', { name: /Directions/ });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('href')).toContain('City%20General%20Hospital');
  });

  it('points directions at the pin when the request carries one', async () => {
    getRequest.mockResolvedValue({
      ...REQUEST,
      hospitalLat: 41.9981,
      hospitalLng: 21.4254,
    });
    renderAt();
    const link = await screen.findByRole('link', { name: /Directions/ });
    expect(link.getAttribute('href')).toContain('41.9981%2C21.4254');
  });

  it('sends a signed-out visitor to register rather than a dead call button', async () => {
    renderAt();
    await screen.findByText('City General Hospital, Skopje');
    expect(screen.queryByRole('link', { name: /Call the hospital/ })).toBeNull();
    expect(
      screen.getByRole('link', { name: /Register to see the number/ }),
    ).toHaveAttribute('href', '/register');
  });

  it('dials the hospital for a signed-in donor', async () => {
    getRequest.mockResolvedValue({ ...REQUEST, contactPhone: '+389 2 555 0100' });
    renderAt('r2', { signedIn: true });

    const call = await screen.findByRole('link', { name: /Call the hospital/ });
    // The dialler gets digits: some of them try to dial the spaces.
    expect(call).toHaveAttribute('href', 'tel:+38925550100');
  });

  it('presents the token, or the number never comes back at all', async () => {
    // The API selects the contact column only when there is a viewer, so a
    // request fetched anonymously has no number to show however we render it.
    renderAt('r2', { signedIn: true });
    await screen.findByText('City General Hospital, Skopje');
    expect(getRequest).toHaveBeenCalledWith('r2', 'access-token');
  });

  it('never loads the map for a request with no pin', async () => {
    /* Leaflet is 150kB and this screen opens from an email on a phone. Most
       of the point of the lazy import is that it is never fetched at all. */
    renderAt();
    await screen.findByText('City General Hospital, Skopje');
    expect(screen.queryByText(/stub map/)).toBeNull();
    expect(screen.queryByText('Where to go')).toBeNull();
  });

  it('shows the map when there is somewhere to point it', async () => {
    getRequest.mockResolvedValue({
      ...REQUEST,
      hospitalLat: 41.9981,
      hospitalLng: 21.4254,
    });
    renderAt();
    expect(await screen.findByText('stub map 41.9981,21.4254')).toBeInTheDocument();
  });

  it('says plainly when the request is not there', async () => {
    getRequest.mockRejectedValue(
      new ApiError('NOT_FOUND', 'That request does not exist.', 404, undefined),
    );
    renderAt('nope');
    expect(await screen.findByText(/That request is not here/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to requests/ })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('separates a broken connection from a missing request', async () => {
    // A dead network telling someone the request does not exist would be a
    // lie, and the actions differ: retry versus go back.
    getRequest.mockRejectedValue(
      new ApiError('INTERNAL', 'We could not reach the server.', 0, undefined),
    );
    renderAt();
    expect(await screen.findByText(/couldn’t load this request/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument();
  });

  it('links back to the feed', async () => {
    renderAt();
    await screen.findByText('City General Hospital, Skopje');
    expect(screen.getByRole('link', { name: /All requests/ })).toHaveAttribute(
      'href',
      '/',
    );
  });
});
