import { useEffect, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthedBloodRequest, CreateRequestInput } from '@kapka/shared';
import { SessionProvider } from '../lib/SessionProvider';
import { useSession } from '../lib/session';
import { ApiError, type Session } from '../lib/api';
import PostRequest from './PostRequest';

const createRequest =
  vi.fn<(input: CreateRequestInput, token: string) => Promise<AuthedBloodRequest>>();

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    api: {
      createRequest: (input: CreateRequestInput, token: string) =>
        createRequest(input, token),
    },
  };
});

/*
 * Leaflet needs real layout — element sizes, a scroll container — and jsdom has
 * none of it, so the map is stubbed. What this file is about is the form and
 * what it sends; the map's own job is one click handler, and it is checked by
 * driving that handler here rather than by rendering tiles.
 */
vi.mock('../components/HospitalMap/HospitalMap', () => ({
  default: ({ onPick }: { onPick: (lat: number, lng: number) => void }) => (
    <button type="button" onClick={() => onPick(41.9981, 21.4254)}>
      stub map
    </button>
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

/** jsdom answers every media query "no", so the default here is the phone. */
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

function SignedIn({ children }: { children: ReactNode }) {
  const { session, signIn } = useSession();
  useEffect(() => {
    signIn(SESSION);
  }, [signIn]);
  return session ? <>{children}</> : null;
}

function renderPage({ signedIn = true } = {}) {
  return render(
    <MemoryRouter>
      <SessionProvider>
        {signedIn ? (
          <SignedIn>
            <PostRequest />
          </SignedIn>
        ) : (
          <PostRequest />
        )}
      </SessionProvider>
    </MemoryRouter>,
  );
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'O negative' }));
  await pickCity(user, 'Skopje');
  await user.type(screen.getByLabelText(/Hospital/), 'City General');
  await user.type(screen.getByLabelText(/Contact phone/), '+389 70 123 456');
}

const submit = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: /Post request/ }));

/** The city control is a listbox we draw, not a <select> — see Picker. */
async function pickCity(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('combobox', { name: /City/ }));
  await user.click(screen.getByRole('option', { name }));
}

beforeEach(() => {
  /* The form autosaves, so without this each test starts with whatever the
     previous one was halfway through typing. */
  localStorage.clear();
  setViewport('phone');
  createRequest.mockReset();
  createRequest.mockResolvedValue({
    id: 'r-new',
    bloodType: 'O-',
    unitsNeeded: 1,
    urgency: 'urgent',
    hospitalName: 'City General',
    hospitalLat: null,
    hospitalLng: null,
    city: 'Skopje',
    contactPhone: '+389 70 123 456',
    note: null,
    status: 'pending',
    createdAt: new Date().toISOString(),
    expiresAt: new Date().toISOString(),
  });
});

describe('posting a request', () => {
  it('offers all eight blood types as buttons, not a dropdown', async () => {
    // The one answer on this form that must not be wrong. All eight are on
    // screen; none of them is hidden behind a tap.
    renderPage();
    for (const name of [
      'O negative',
      'O positive',
      'A negative',
      'A positive',
      'B negative',
      'B positive',
      'A B negative',
      'A B positive',
    ]) {
      expect(await screen.findByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('sends what was filled in', async () => {
    const user = userEvent.setup();
    renderPage();
    await fillValidForm(user);
    await submit(user);

    await waitFor(() => {
      expect(createRequest).toHaveBeenCalledTimes(1);
    });
    expect(createRequest.mock.calls[0]?.[0]).toMatchObject({
      bloodType: 'O-',
      city: 'Skopje',
      hospitalName: 'City General',
      contactPhone: '+389 70 123 456',
      // The defaults a two-minute screen should not make anyone choose.
      unitsNeeded: 1,
      urgency: 'urgent',
    });
    expect(createRequest.mock.calls[0]?.[1]).toBe('access-token');
  });

  it('says an admin has it, not that donors have been emailed', async () => {
    // A requester who believes donors are already on the way stops looking
    // for blood by other means. Nothing is sent until it is approved.
    const user = userEvent.setup();
    renderPage();
    await fillValidForm(user);
    await submit(user);

    expect(await screen.findByText(/with an admin/i)).toBeInTheDocument();
  });

  it('sends nothing when the form is incomplete', async () => {
    const user = userEvent.setup();
    renderPage();
    await submit(user);

    expect(createRequest).not.toHaveBeenCalled();
    // The message comes from createRequestSchema, the same object the API
    // validates with.
    expect(await screen.findByText('Enter the hospital name.')).toBeInTheDocument();
  });

  it('checks a field when it loses focus, not while it is being typed', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/Contact phone/), '12');
    expect(screen.queryByText(/too short/)).not.toBeInTheDocument();

    await user.tab();
    expect(await screen.findByText(/too short/)).toBeInTheDocument();
  });

  it('reports a server error as a message, not a blank page', async () => {
    createRequest.mockRejectedValue(
      new ApiError('INTERNAL', 'We could not reach the server.', 0),
    );
    const user = userEvent.setup();
    renderPage();
    await fillValidForm(user);
    await submit(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not reach the server.',
    );
  });

  it('sends someone with no account to make one, rather than a 401', async () => {
    renderPage({ signedIn: false });
    expect(
      await screen.findByRole('heading', { name: /need an account/i }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/Hospital/)).not.toBeInTheDocument();
  });
});

describe('the draft that survives a dropped connection', () => {
  /** Everything a reload does that matters here: the component goes and comes
      back, and only what reached storage comes back with it. */
  function reload(rendered: { unmount: () => void }) {
    rendered.unmount();
    return renderPage();
  }

  it('brings back a half-filled form, and says that is what happened', async () => {
    const user = userEvent.setup();
    const first = renderPage();
    await user.type(await screen.findByLabelText(/Hospital/), 'City General');
    await user.type(screen.getByLabelText(/Contact phone/), '+389 70 123 456');

    reload(first);

    expect(await screen.findByLabelText(/Hospital/)).toHaveValue('City General');
    expect(screen.getByLabelText(/Contact phone/)).toHaveValue('+389 70 123 456');
    // Not silently: a form that is mysteriously already filled in is
    // unsettling, and on a shared machine it is somebody else's question.
    expect(screen.getByText(/We kept what you had typed/)).toBeInTheDocument();
  });

  it('brings back the blood type too, not only the text', async () => {
    const user = userEvent.setup();
    const first = renderPage();
    await user.click(await screen.findByRole('button', { name: 'O negative' }));

    reload(first);

    expect(await screen.findByRole('button', { name: 'O negative' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('says nothing about a draft on a form nobody has touched', async () => {
    renderPage();
    await screen.findByLabelText(/Hospital/);
    expect(screen.queryByText(/We kept what you had typed/)).not.toBeInTheDocument();
  });

  it('throws the draft away when asked, and does not bring it back', async () => {
    const user = userEvent.setup();
    const first = renderPage();
    await user.type(await screen.findByLabelText(/Hospital/), 'City General');
    const second = reload(first);

    await user.click(await screen.findByRole('button', { name: /Start over/ }));
    expect(screen.getByLabelText(/Hospital/)).toHaveValue('');
    expect(screen.queryByText(/We kept what you had typed/)).not.toBeInTheDocument();

    // And it is gone from storage, not merely off the screen.
    reload(second);
    expect(await screen.findByLabelText(/Hospital/)).toHaveValue('');
  });

  it('keeps the draft when the post fails — which is the whole point', async () => {
    createRequest.mockRejectedValue(
      new ApiError('INTERNAL', 'We could not reach the server.', 0),
    );
    const user = userEvent.setup();
    const first = renderPage();
    await fillValidForm(user);
    await submit(user);
    await screen.findByRole('alert');

    reload(first);
    expect(await screen.findByLabelText(/Hospital/)).toHaveValue('City General');
  });

  it('forgets it once the request is actually posted', async () => {
    // The API has it now, and this may be a shared machine.
    const user = userEvent.setup();
    const first = renderPage();
    await fillValidForm(user);
    await submit(user);
    await screen.findByText(/with an admin/i);

    reload(first);
    expect(await screen.findByLabelText(/Hospital/)).toHaveValue('');
  });
});

describe('the phone, where the map is not', () => {
  it('renders no preview column and never loads the map', async () => {
    // §11: a five-year-old Android on 3G does not download a mapping library
    // for a column it has no room to show.
    renderPage();
    await screen.findByLabelText(/Hospital/);
    expect(screen.queryByText('stub map')).not.toBeInTheDocument();
    expect(screen.queryByText(/How donors will see it/)).not.toBeInTheDocument();
  });
});

describe('the desktop preview column', () => {
  beforeEach(() => {
    setViewport('desktop');
  });

  it('mirrors the form into a card as it is filled in', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText(/How donors will see it/)).toBeInTheDocument();
    // Nothing to mirror yet, and no invented blood type standing in for one.
    expect(screen.getByText(/Choose a blood type/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'O negative' }));
    await user.type(screen.getByLabelText(/Hospital/), 'City General');

    expect(await screen.findByText('City General')).toBeInTheDocument();
  });

  it('puts a pin from the map into what gets sent', async () => {
    const user = userEvent.setup();
    renderPage();
    await fillValidForm(user);

    await user.click(await screen.findByRole('button', { name: 'stub map' }));
    expect(await screen.findByText(/Pin placed/)).toBeInTheDocument();

    await submit(user);
    await waitFor(() => {
      expect(createRequest).toHaveBeenCalled();
    });
    expect(createRequest.mock.calls[0]?.[0]).toMatchObject({
      hospitalLat: 41.9981,
      hospitalLng: 21.4254,
    });
  });

  it('lets the pin be taken off again', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'stub map' }));
    await user.click(await screen.findByRole('button', { name: /Remove it/ }));
    expect(screen.queryByText(/Pin placed/)).not.toBeInTheDocument();
  });
});
