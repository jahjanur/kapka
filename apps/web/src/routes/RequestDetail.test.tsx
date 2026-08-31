import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicBloodRequest } from '@kapka/shared';
import { ThemeProvider } from '../lib/ThemeProvider';
import { SessionProvider } from '../lib/SessionProvider';
import { ApiError } from '../lib/api';
import RequestDetail from './RequestDetail';

const getRequest = vi.fn<(id: string) => Promise<PublicBloodRequest>>();
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, api: { getRequest: (id: string) => getRequest(id) } };
});

const REQUEST: PublicBloodRequest = {
  id: 'r2',
  bloodType: 'O-',
  unitsNeeded: 3,
  urgency: 'critical',
  hospitalName: 'City General Hospital',
  city: 'Skopje',
  note: 'Road traffic accident, theatre is prepped.',
  status: 'approved',
  createdAt: new Date(Date.now() - 12 * 60_000).toISOString(),
  expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
};

const renderAt = (id = 'r2') =>
  render(
    <MemoryRouter initialEntries={[`/requests/${id}`]}>
      <ThemeProvider>
        <SessionProvider>
          <Routes>
            <Route path="/requests/:id" element={<RequestDetail />} />
          </Routes>
        </SessionProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  getRequest.mockReset();
  getRequest.mockResolvedValue(REQUEST);
});

describe('one request in full', () => {
  it('asks for the request in the URL', async () => {
    renderAt('r2');
    await screen.findByText('City General Hospital, Skopje');
    expect(getRequest).toHaveBeenCalledWith('r2');
  });

  it('shows what a donor needs to decide', async () => {
    const { container } = renderAt();
    await screen.findByText('City General Hospital, Skopje');

    expect(container.textContent).toContain('O−');
    expect(container.textContent).toMatch(/critical/i);
    expect(container.textContent).toContain('3');
    expect(container.textContent).toContain('Road traffic accident, theatre is prepped.');
  });

  it('announces the blood type in words, not as a glyph', async () => {
    const { container } = renderAt();
    await screen.findByText('City General Hospital, Skopje');
    expect(container.textContent).toContain('O negative');
  });

  it('offers registering, which is the only thing a stranger can do here', async () => {
    renderAt();
    await screen.findByText('City General Hospital, Skopje');
    // Two of them — the header and the action rail — and neither may be a
    // button that goes nowhere.
    const links = screen.getAllByRole('link', { name: /Register as donor/ });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link).toHaveAttribute('href', '/register');
  });

  it('never shows contact details to a signed-out visitor', async () => {
    // §12: contact is not on the public feed, and this page is public.
    const { container } = renderAt();
    await screen.findByText('City General Hospital, Skopje');
    expect(container.textContent).toMatch(/Hidden while you are signed out/);
    expect(container.textContent).not.toMatch(/\+389|07\d{7}/);
  });

  it('says plainly when the request is not there', async () => {
    getRequest.mockRejectedValue(
      new ApiError('NOT_FOUND', 'That request does not exist.', 404, undefined),
    );
    renderAt('nope');
    expect(await screen.findByText(/That request is not here/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to requests/ })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('separates a broken connection from a missing request', async () => {
    // A dead network telling someone the request does not exist would be a
    // lie, and the actions differ: retry versus go back.
    getRequest.mockRejectedValue(
      new ApiError('INTERNAL', 'We could not reach the server.', 0, undefined),
    );
    renderAt();
    expect(await screen.findByText(/couldn’t load this request/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument();
  });

  it('links back to the feed', async () => {
    renderAt();
    await screen.findByText('City General Hospital, Skopje');
    expect(screen.getByRole('link', { name: /All requests/ })).toHaveAttribute(
      'href',
      '/',
    );
  });
});
