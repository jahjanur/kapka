import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionProvider } from '../lib/SessionProvider';
import type { AuthProvider } from '../lib/api';
import Welcome from './Welcome';

const listAuthProviders = vi.fn<() => Promise<AuthProvider[]>>();

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    api: {
      listAuthProviders: () => listAuthProviders(),
      authStartUrl: (provider: string) => `/api/auth/${provider}`,
      restoreSession: () => Promise.resolve(null),
    },
  };
});

function renderGate() {
  return render(
    <SessionProvider>
      <MemoryRouter initialEntries={['/register']}>
        <Welcome />
      </MemoryRouter>
    </SessionProvider>,
  );
}

/** The row, however it is currently being rendered. */
const providerRow = () => document.querySelector('[class*="providerBlock"]');

beforeEach(() => {
  listAuthProviders.mockReset();
});

describe('the gate', () => {
  it('always offers the two ways in', () => {
    listAuthProviders.mockResolvedValue([]);
    renderGate();
    expect(screen.getByRole('link', { name: /Create account/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Log in/ })).toBeInTheDocument();
  });

  it('holds the provider row in place while the answer is on its way', () => {
    /*
     * The regression this file exists for. The row used to render only once
     * the API had answered, so it dropped in about a third of a second after
     * the page and shoved everything above it 106px up the screen — under
     * the thumb of somebody already reaching for "Create account".
     *
     * Pending, the row is in the document and hidden, which is what keeps
     * its space. It must not be display:none, and its links must not be
     * reachable yet.
     */
    listAuthProviders.mockReturnValue(new Promise(() => undefined));
    renderGate();

    const row = providerRow();
    expect(row).toBeInTheDocument();
    expect(row).toHaveAttribute('data-pending');
    // Hidden by visibility, so it is out of the tab order and unread — but
    // still occupying its own height.
    expect(row).not.toHaveAttribute('hidden');
  });

  it('shows the provider the API offers, pointing at the API', async () => {
    listAuthProviders.mockResolvedValue(['google']);
    renderGate();

    const google = await screen.findByRole('link', { name: 'Google' });
    expect(google).toHaveAttribute('href', '/api/auth/google');
    await waitFor(() => expect(providerRow()).not.toHaveAttribute('data-pending'));
  });

  it('offers none, and no row, when the deployment has none', async () => {
    /* A button for a provider whose credentials are not configured would
       redirect to a failure, and a control that cannot do its job is worse
       than no control. */
    listAuthProviders.mockResolvedValue([]);
    renderGate();

    await waitFor(() => expect(providerRow()).not.toBeInTheDocument());
    expect(screen.queryByRole('link', { name: 'Google' })).toBeNull();
  });

  it('keeps its own two buttons when the API cannot be reached', async () => {
    listAuthProviders.mockRejectedValue(new Error('offline'));
    renderGate();

    await waitFor(() => expect(providerRow()).not.toBeInTheDocument());
    expect(screen.getByRole('link', { name: /Create account/ })).toBeInTheDocument();
  });
});
