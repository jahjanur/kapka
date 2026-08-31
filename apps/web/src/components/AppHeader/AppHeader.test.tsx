import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ThemeProvider } from '../../lib/ThemeProvider';
import { AppHeader } from './AppHeader';

function renderHeader() {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <AppHeader />
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe('the product header', () => {
  it('shows the name and a way to register', () => {
    renderHeader();
    expect(screen.getByRole('link', { name: /Kapka/ })).toHaveAttribute('href', '/');
    expect(screen.getByRole('button', { name: /Register/ })).toBeInTheDocument();
  });

  it('links nowhere developer-facing', () => {
    /*
     * A "Design system" link sat in this nav and shipped. Someone reading this
     * header is looking for blood or offering to give it; a link to the
     * component gallery is noise at best and looks unfinished at worst.
     *
     * The kitchen sink is reachable by typing the URL in development, and is
     * not routed at all in a production build.
     */
    const { container } = renderHeader();
    const hrefs = [...container.querySelectorAll('a')].map(
      (a) => a.getAttribute('href') ?? '',
    );
    for (const href of hrefs) {
      expect(href).not.toMatch(/kitchen-sink|storybook|styleguide|design-system/i);
    }
    expect(container.textContent).not.toMatch(/design system/i);
  });

  it('offers no navigation to screens that do not exist yet', () => {
    // A nav item pointing at a route that is not built is worse than no nav.
    const { container } = renderHeader();
    const hrefs = [...container.querySelectorAll('a')].map(
      (a) => a.getAttribute('href') ?? '',
    );
    for (const href of hrefs) {
      expect(['/', '#main']).toContain(href);
    }
  });
});
