import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicBloodRequest } from '@kapka/shared';
import { ApiError } from '../../lib/api';
import { MenuActivity } from './MenuActivity';

const listRequests = vi.fn<() => Promise<PublicBloodRequest[]>>();
vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return { ...actual, api: { listRequests: () => listRequests() } };
});

const request = (over: Partial<PublicBloodRequest> = {}): PublicBloodRequest => ({
  id: 'r1',
  bloodType: 'O-',
  unitsNeeded: 2,
  urgency: 'urgent',
  hospitalName: 'City General',
  city: 'Skopje',
  note: null,
  status: 'approved',
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  ...over,
});

const figures = () => screen.queryByRole('region', { name: 'Right now' });

beforeEach(() => {
  listRequests.mockReset();
});

describe('the menu’s live figures', () => {
  it('counts the requests and adds up what they need', async () => {
    /* Both numbers are the list itself: nothing here is stored, so neither
       can drift from what the feed shows. */
    listRequests.mockResolvedValue([
      request({ id: 'a', unitsNeeded: 3 }),
      request({ id: 'b', unitsNeeded: 2 }),
      request({ id: 'c', unitsNeeded: 4 }),
    ]);
    render(<MenuActivity />);

    expect(await screen.findByText('3')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('Open requests')).toBeInTheDocument();
    expect(screen.getByText('Units needed')).toBeInTheDocument();
  });

  it('holds the space while the answer is on its way, and shows no number', () => {
    /* A skeleton, not a flash of "0" — and the same height either way, so
       nothing below it moves when the figures land. */
    listRequests.mockReturnValue(new Promise(() => undefined));
    render(<MenuActivity />);

    expect(figures()).toBeInTheDocument();
    expect(screen.queryByText('0')).toBeNull();
    expect(screen.queryByText('Open requests')).toBeNull();
  });

  it('says so plainly when nothing is open', async () => {
    // Zero open requests is good news, and "0" set in display type is not how
    // good news should look at the foot of a menu.
    listRequests.mockResolvedValue([]);
    render(<MenuActivity />);

    expect(await screen.findByText('No open requests right now.')).toBeInTheDocument();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('is not there at all when the request fails', async () => {
    // A menu is not the place to report that a count could not be fetched.
    listRequests.mockRejectedValue(new ApiError('INTERNAL', 'No.', 500));
    const { container } = render(<MenuActivity />);

    await vi.waitFor(() => {
      expect(figures()).toBeNull();
    });
    expect(container.textContent).toBe('');
  });
});
