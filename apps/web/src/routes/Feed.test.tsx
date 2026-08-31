import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicBloodRequest } from '@kapka/shared';
import { ThemeProvider } from '../lib/ThemeProvider';
import { SessionProvider } from '../lib/SessionProvider';
import { ApiError } from '../lib/api';
import Feed from './Feed';

const listRequests = vi.fn<() => Promise<PublicBloodRequest[]>>();
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, api: { listRequests: () => listRequests() } };
});

const at = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const request = (over: Partial<PublicBloodRequest>): PublicBloodRequest => ({
  id: 'r1',
  bloodType: 'O-',
  unitsNeeded: 2,
  urgency: 'routine',
  hospitalName: 'City General',
  city: 'Skopje',
  note: null,
  status: 'approved',
  createdAt: at(30),
  expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  ...over,
});

const REQUESTS = [
  request({ id: 'r1', urgency: 'routine', bloodType: 'A+', city: 'Bitola' }),
  request({
    id: 'r2',
    urgency: 'critical',
    bloodType: 'O-',
    city: 'Skopje',
    hospitalName: 'Mother Teresa',
    createdAt: at(5),
  }),
  request({ id: 'r3', urgency: 'urgent', bloodType: 'B-', city: 'Skopje' }),
];

const renderFeed = () =>
  render(
    <MemoryRouter>
      <ThemeProvider>
        <SessionProvider>
          <Feed />
        </SessionProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  listRequests.mockReset();
  listRequests.mockResolvedValue(REQUESTS);
});

describe('the public feed', () => {
  it('links every card to its own request', async () => {
    renderFeed();
    const card = await screen.findByRole('link', { name: /Mother Teresa/ });
    expect(card).toHaveAttribute('href', '/requests/r2');
  });

  it('puts the most urgent request first', async () => {
    // Someone scanning this in a hurry should not be reading whatever order
    // the database happened to return.
    renderFeed();
    await screen.findByText('3 open requests');
    const headings = screen.getAllByRole('heading', { level: 3 });
    expect(headings[0]).toHaveTextContent('Mother Teresa');
  });

  it('offers registering as a link, not a dead button', async () => {
    renderFeed();
    await screen.findByText('3 open requests');
    for (const link of screen.getAllByRole('link', { name: /Register as donor/ })) {
      expect(link).toHaveAttribute('href', '/register');
    }
  });

  it('filters by city', async () => {
    const user = userEvent.setup();
    renderFeed();
    await screen.findByText('3 open requests');

    await user.selectOptions(screen.getByLabelText('City'), 'Bitola');
    await waitFor(() => {
      expect(screen.getByText('1 open request')).toBeInTheDocument();
    });
    expect(screen.queryByText('Mother Teresa')).not.toBeInTheDocument();
  });

  it('filters by urgency, and says so in the singular', async () => {
    const user = userEvent.setup();
    renderFeed();
    await screen.findByText('3 open requests');

    await user.click(screen.getByRole('button', { name: 'Critical' }));
    expect(await screen.findByText('1 open request')).toBeInTheDocument();
  });

  it('offers a way back when the filters match nothing', async () => {
    const user = userEvent.setup();
    renderFeed();
    await screen.findByText('3 open requests');

    await user.click(screen.getByRole('button', { name: 'Critical' }));
    await user.selectOptions(screen.getByLabelText('City'), 'Bitola');

    const empty = await screen.findByText(/No requests match these filters/);
    expect(empty).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Clear filters/ }));
    expect(await screen.findByText('3 open requests')).toBeInTheDocument();
  });

  it('counts the whole feed in the stat strip, not the filtered view', async () => {
    const user = userEvent.setup();
    renderFeed();
    const strip = (await screen.findByText('Open requests')).closest('dl');
    if (!strip) throw new Error('no stat strip');

    // 3 open, 1 critical, 2 cities.
    expect(within(strip).getByText('3')).toBeInTheDocument();
    expect(within(strip).getByText('1')).toBeInTheDocument();
    expect(within(strip).getByText('2')).toBeInTheDocument();

    // Narrowing the list must not change what the strip reports: it
    // describes what is open, and a filter is the reader's own view of it.
    await user.click(screen.getByRole('button', { name: 'Critical' }));
    await screen.findByText('1 open request');
    expect(within(strip).getByText('3')).toBeInTheDocument();
  });

  it('shows a retry when the list cannot be loaded', async () => {
    listRequests.mockRejectedValue(
      new ApiError('INTERNAL', 'We could not reach the server.', 0, undefined),
    );
    renderFeed();
    expect(await screen.findByText(/couldn’t load the requests/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument();
  });

  it('says something useful when nothing is open', async () => {
    listRequests.mockResolvedValue([]);
    renderFeed();
    expect(await screen.findByText(/No open requests right now/)).toBeInTheDocument();
  });
});
