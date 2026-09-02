import { useEffect, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ThemeProvider } from '../../lib/ThemeProvider';
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

function SignedIn({
  children,
  confirmed = true,
}: {
  children: ReactNode;
  confirmed?: boolean;
}) {
  const { session, signIn } = useSession();
  useEffect(() => {
    signIn({ ...SESSION, user: { ...SESSION.user, emailVerified: confirmed } });
  }, [signIn, confirmed]);
  return session ? <>{children}</> : null;
}

function renderSignedInHeader({ confirmed = true } = {}) {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <SessionProvider>
          <SignedIn confirmed={confirmed}>
            <AppHeader />
          </SignedIn>
        </SessionProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

function renderHeader() {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <SessionProvider>
          <AppHeader />
        </SessionProvider>
      </ThemeProvider>
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

  it('points the bell at the list it is a bell for', () => {
    /* There is no notification centre in this product. The one thing behind
       this control is the list of what we have actually emailed this donor
       about, which lives on their profile. */
    renderSignedInHeader();
    expect(
      screen.getByRole('link', { name: 'What we have emailed you about' }),
    ).toHaveAttribute('href', '/me#notifications');
  });

  it('says why the bell is marked when the address is unconfirmed', () => {
    /* The dot is not "unread" — nothing here has a read state. It means this
       account is left out of the matching until the address is confirmed, so
       the list behind the bell will stay empty however many requests match.
       A screen reader is told that rather than left with a red circle. */
    renderSignedInHeader({ confirmed: false });
    expect(
      screen.getByRole('link', { name: /your email is not confirmed yet/i }),
    ).toBeInTheDocument();
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
