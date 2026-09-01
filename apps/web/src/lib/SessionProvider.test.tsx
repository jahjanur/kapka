import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type Session } from './api';
import { SessionProvider } from './SessionProvider';
import { useSession } from './session';

const restoreSession = vi.fn<() => Promise<Session | null>>();
vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return { ...actual, api: { restoreSession: () => restoreSession() } };
});

const SESSION: Session = {
  user: {
    id: 'u1',
    email: 'ana@example.com',
    fullName: 'Ana Petrovska',
    role: 'admin',
    emailVerified: true,
  },
  accessToken: 'token',
};

/** Reports what a screen would see, so the assertions read like one. */
function Probe() {
  const { session, restoring } = useSession();
  return <p>{restoring ? 'restoring' : (session?.user.role ?? 'signed out')}</p>;
}

const renderProbe = () =>
  render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  );

beforeEach(() => {
  restoreSession.mockReset();
});

describe('restoring a session on boot', () => {
  it('adopts the session the browser already had', async () => {
    /*
     * The access token lives in memory and dies with the tab; the refresh
     * cookie is httpOnly and does not (§12). Without this call a reload is a
     * sign-out, and since there is no sign-in screen it was also the only
     * thing keeping the moderation queue unreachable in a running browser.
     */
    restoreSession.mockResolvedValue(SESSION);
    renderProbe();

    expect(screen.getByText('restoring')).toBeInTheDocument();
    expect(await screen.findByText('admin')).toBeInTheDocument();
  });

  it('settles as signed out when there is no session', async () => {
    // 401 is the ordinary answer for arriving with no cookie, so the client
    // turns it into null rather than an error nobody needs to see.
    restoreSession.mockResolvedValue(null);
    renderProbe();

    expect(await screen.findByText('signed out')).toBeInTheDocument();
  });

  it('does not hold the app hostage to an unreachable server', async () => {
    /* The feed is public and reads perfectly well signed out. Leaving
       `restoring` true forever would put every screen that waits on it behind
       a spinner because one request failed. */
    restoreSession.mockRejectedValue(
      new ApiError('INTERNAL', 'We could not reach the server.', 0),
    );
    renderProbe();

    await waitFor(() => {
      expect(screen.getByText('signed out')).toBeInTheDocument();
    });
  });
});
