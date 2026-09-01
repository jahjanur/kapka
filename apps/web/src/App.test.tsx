import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';

/*
 * The whole app, wired the way main.tsx wires it, against the seed data the
 * dev build serves.
 *
 * The unit tests each render one screen with its providers supplied by hand,
 * so every one of them would still pass with ThemeProvider or SessionProvider
 * missing from App — a blank page in the browser and a green suite. This is
 * the test that fails instead.
 */
describe('the app end to end', () => {
  // BrowserRouter reads window.location, and jsdom keeps it between tests —
  // so without this each test starts wherever the previous one navigated to.
  beforeEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('opens on the feed', async () => {
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: /Someone nearby needs blood/ }),
    ).toBeInTheDocument();
    await screen.findByText(/open requests/);
  });

  it('walks from a request card to its detail page', async () => {
    const user = userEvent.setup();
    render(<App />);

    const card = await screen.findByRole('link', {
      name: /City General Hospital 8th September/,
    });
    await user.click(card);

    await waitFor(() => {
      expect(window.location.pathname).toBe('/requests/r1');
    });
    expect(
      await screen.findByText('City General Hospital 8th September, Skopje'),
    ).toBeInTheDocument();
  });

  it('reaches the post-request screen, not a request called "new"', async () => {
    /* /requests/new and /requests/:id both match this URL. React Router ranks
       the static segment higher whatever order they are declared in, and this
       is what holds that down — getting it wrong renders the detail screen
       looking up a request named "new", which fails as a 404 nobody expects. */
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText(/open requests/);
    const [link] = screen.getAllByRole('link', { name: /Post a request/ });
    if (!link) throw new Error('nothing links to the post-request screen');
    await user.click(link);

    await waitFor(() => {
      expect(window.location.pathname).toBe('/requests/new');
    });
    // Signed out, so this is the screen's own "you need an account" state —
    // which is still proof that this screen, and not the detail one, matched.
    expect(
      await screen.findByRole('heading', { name: /need an account/i }),
    ).toBeInTheDocument();
  });

  it('walks from the header to registration', async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText(/open requests/);
    const [registerLink] = screen.getAllByRole('link', { name: /Register/ });
    if (!registerLink) throw new Error('no register link in the header');
    await user.click(registerLink);

    expect(
      await screen.findByRole('heading', { name: /Become a donor/ }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Full name/)).toBeInTheDocument();
  });

  it('shows the not-found screen for an address that is not a route', async () => {
    window.history.pushState({}, '', '/nothing-here');
    render(<App />);
    expect(
      await screen.findByText(/There is nothing at this address/),
    ).toBeInTheDocument();
  });
});
