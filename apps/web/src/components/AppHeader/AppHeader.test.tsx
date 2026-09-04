import { useEffect, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionProvider } from '../../lib/SessionProvider';
import { STATIC_PATHS } from '../../routes/paths';
import { useSession } from '../../lib/session';
import type { Session } from '../../lib/api';
import { AppHeader } from './AppHeader';

/* The menu's figures read the request list. Mocked so the test can watch
   WHEN it is asked for, which is the whole point of mounting the panel
   lazily. */
const listRequests = vi.fn(() => Promise.resolve([]));
vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return {
    ...actual,
    api: { ...actual.api, listRequests: () => listRequests() },
  };
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

function SignedIn({
  children,
  session: given = SESSION,
}: {
  children: ReactNode;
  session?: Session;
}) {
  const { session, signIn } = useSession();
  useEffect(() => {
    signIn(given);
  }, [signIn, given]);
  return session ? <>{children}</> : null;
}

function renderSignedInHeader() {
  return render(
    <MemoryRouter>
      <SessionProvider>
        <SignedIn>
          <AppHeader />
        </SignedIn>
      </SessionProvider>
    </MemoryRouter>,
  );
}

function renderHeader() {
  return render(
    <MemoryRouter>
      <SessionProvider>
        <AppHeader />
      </SessionProvider>
    </MemoryRouter>,
  );
}

/* Cleared per test: several tests in this file open the menu, and without
   this the "not yet asked" assertion below would be counting their calls. */
beforeEach(() => {
  listRequests.mockClear();
});

const hrefsIn = (container: HTMLElement) =>
  [...container.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '');

describe('the product header', () => {
  it('shows the name and a way to register', async () => {
    renderHeader();
    expect(screen.getByRole('link', { name: /Kapka/ })).toHaveAttribute('href', '/');
    /* Awaited, not queried straight away: the action slot renders nothing
       until the boot refresh answers, so that a returning donor never sees
       "Register" turn into their own avatar. A link, not a button — it
       navigates, so it has to be openable in a tab. */
    expect(await screen.findByRole('link', { name: /Register/ })).toHaveAttribute(
      'href',
      '/register',
    );
  });

  it('takes a signed-in reader to their own profile', async () => {
    /* The wide-screen way there. On a phone it is display:none and the menu
       carries it instead — the test below this one holds that half down.
       jsdom applies no CSS, so this asserts the link exists and is pointed
       correctly, not which width shows it. */
    renderSignedInHeader();
    expect(await screen.findByRole('link', { name: 'Your profile' })).toHaveAttribute(
      'href',
      '/me',
    );
  });

  it('does not ask somebody with an account to register', () => {
    renderSignedInHeader();
    expect(screen.queryByRole('link', { name: /Register/ })).toBeNull();
  });

  it('links nowhere developer-facing', () => {
    /*
     * A "Design system" link sat in this nav and shipped. Someone reading this
     * header is looking for blood or offering to give it; a link to a
     * component gallery is noise at best and looks unfinished at worst.
     *
     * There is no such page any more. The guard stays because the next one
     * would arrive the same way — added to the nav by whoever built it.
     */
    const { container } = renderHeader();
    for (const href of hrefsIn(container)) {
      expect(href).not.toMatch(/kitchen-sink|storybook|styleguide|design-system/i);
    }
    expect(container.textContent).not.toMatch(/design system/i);
  });

  it('offers no navigation to a screen that does not exist', () => {
    // A nav item pointing at a route that is not built is worse than no nav.
    // STATIC_PATHS is the same list App.tsx registers its routes from, so a
    // link added here without a route fails this.
    const { container } = renderHeader();
    for (const href of hrefsIn(container)) {
      expect(STATIC_PATHS).toContain(href);
    }
  });

  it('reaches every destination from a phone, where the inline nav is hidden', async () => {
    /* The nav is display:none below 48rem. Before the menu existed that made
       "Post a request" and "How it works" reachable by typing the URL and by
       nothing else — a header of a wordmark and one button. */
    const user = userEvent.setup();
    renderHeader();

    await user.click(screen.getByRole('button', { name: 'Menu' }));

    const menu = screen.getByRole('dialog');
    expect(within(menu).getByRole('link', { name: /Post a request/ })).toHaveAttribute(
      'href',
      '/requests/new',
    );
    expect(within(menu).getByRole('link', { name: /How it works/ })).toHaveAttribute(
      'href',
      '/how-it-works',
    );
  });

  it('heads the menu with who you are, and where that goes', async () => {
    const user = userEvent.setup();
    renderSignedInHeader();

    await user.click(screen.getByRole('button', { name: 'Menu' }));
    const menu = within(screen.getByRole('dialog'));
    expect(menu.getByRole('link', { name: /Ana Petrovska/ })).toHaveAttribute(
      'href',
      '/me',
    );
  });

  it('offers a signed-out reader the way in, not their profile', async () => {
    /* The card at the top of the menu is the account state, so signed out it
       has to be the way to get one — a profile link would be a door to a
       screen that redirects you straight back out. */
    const user = userEvent.setup();
    renderHeader();

    await user.click(screen.getByRole('button', { name: 'Menu' }));
    const menu = within(screen.getByRole('dialog'));
    expect(menu.getByRole('link', { name: /Not signed in/ })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('carries the open count when a screen has one, and nothing when it does not', async () => {
    /* A prop, not a fetch: the badge is not worth asking the API for the whole
       feed on Privacy and Login. Absent beats a zero nobody counted. */
    const user = userEvent.setup();
    const { unmount } = render(
      <MemoryRouter>
        <SessionProvider>
          <AppHeader openRequests={7} />
        </SessionProvider>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Menu' }));
    expect(within(screen.getByRole('dialog')).getByText(/7/)).toBeInTheDocument();
    unmount();

    renderHeader();
    await user.click(screen.getByRole('button', { name: 'Menu' }));
    expect(within(screen.getByRole('dialog')).queryByText(/open$/)).toBeNull();
  });

  it('never asks a registered donor to register, anywhere in the menu', async () => {
    /* The whole point of the change: somebody who has just registered and is
       still checking it worked must not be invited to do it again. */
    const user = userEvent.setup();
    renderSignedInHeader();
    await screen.findByRole('link', { name: 'Your profile' });

    await user.click(screen.getByRole('button', { name: 'Menu' }));
    const menu = within(screen.getByRole('dialog'));
    expect(menu.queryByRole('link', { name: /Register/i })).toBeNull();
    expect(menu.queryByText(/Become a donor/i)).toBeNull();
    expect(menu.getByText(/You are on the list/)).toBeInTheDocument();
  });

  it('still asks a signed-in account with no donor profile', async () => {
    /* An account is not a donor: a Google sign-in has the role and no blood
       type, so it is invisible to matching. It keeps the prompt — pointed at
       the form that asks for what is missing rather than for an account it
       already has. */
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SessionProvider>
          <SignedIn
            session={{ ...SESSION, user: { ...SESSION.user, hasDonorProfile: false } }}
          >
            <AppHeader />
          </SignedIn>
        </SessionProvider>
      </MemoryRouter>,
    );
    await screen.findByRole('link', { name: 'Your profile' });

    await user.click(screen.getByRole('button', { name: 'Menu' }));
    const menu = within(screen.getByRole('dialog'));
    expect(menu.getByRole('link', { name: /Finish becoming a donor/ })).toHaveAttribute(
      'href',
      '/register/new',
    );
  });

  it('does not ask the API for anything until the menu is opened', async () => {
    /* The figures at the foot of the menu read the request list, and this
       header is on thirteen screens. It costs nothing on any of them because
       the panel — and so the fetch inside it — is mounted only when somebody
       opens it. */
    const user = userEvent.setup();
    renderHeader();
    await screen.findByRole('link', { name: /Register/ });
    expect(listRequests).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Menu' }));
    await vi.waitFor(() => {
      expect(listRequests).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps the menu out of the page until it is asked for', () => {
    /* Mounted only while open. Left standing behind a closed dialog, every
       destination would be in the accessibility tree twice. */
    renderHeader();
    expect(screen.queryByRole('dialog', { hidden: true })).toBeNull();
    expect(screen.getAllByRole('link', { name: 'Requests' })).toHaveLength(1);
  });

  it('names the current screen for a screen reader, not only by colour', () => {
    // NavLink sets aria-current="page"; without it the active styling is a
    // shade of grey and nothing else.
    renderHeader();
    expect(screen.getByRole('link', { name: 'Requests' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'How it works' })).not.toHaveAttribute(
      'aria-current',
    );
  });
});
