import { useEffect, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SessionProvider } from '../../lib/SessionProvider';
import { STATIC_PATHS } from '../../routes/paths';
import { useSession } from '../../lib/session';
import type { Session } from '../../lib/api';
import { AppHeader } from './AppHeader';

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

function SignedIn({ children }: { children: ReactNode }) {
  const { session, signIn } = useSession();
  useEffect(() => {
    signIn(SESSION);
  }, [signIn]);
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

const hrefsIn = (container: HTMLElement) =>
  [...container.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '');

describe('the product header', () => {
  it('shows the name and a way to register', () => {
    renderHeader();
    expect(screen.getByRole('link', { name: /Kapka/ })).toHaveAttribute('href', '/');
    // A link, not a button: it navigates, so it has to be openable in a tab.
    expect(screen.getByRole('link', { name: /Register/ })).toHaveAttribute(
      'href',
      '/register',
    );
  });

  it('takes a signed-in reader to their own profile', () => {
    /* On a phone this is the only way there: the nav is hidden below 48rem,
       so while the avatar was a plain span, /me was reachable by typing the
       URL and by nothing else. */
    renderSignedInHeader();
    expect(screen.getByRole('link', { name: 'Your profile' })).toHaveAttribute(
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

  it('offers a signed-in reader their profile in the menu', async () => {
    const user = userEvent.setup();
    renderSignedInHeader();

    await user.click(screen.getByRole('button', { name: 'Menu' }));
    expect(
      within(screen.getByRole('dialog')).getByRole('link', { name: /Your profile/ }),
    ).toHaveAttribute('href', '/me');
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
