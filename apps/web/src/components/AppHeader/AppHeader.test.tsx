import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ThemeProvider } from '../../lib/ThemeProvider';
import { SessionProvider } from '../../lib/SessionProvider';
import { STATIC_PATHS } from '../../routes/paths';
import { AppHeader } from './AppHeader';

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
