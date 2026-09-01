import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PublicBloodRequest } from '@kapka/shared';
import { RequestCard } from './RequestCard';

const request: PublicBloodRequest = {
  id: 'r1',
  bloodType: 'O-',
  unitsNeeded: 3,
  urgency: 'critical',
  hospitalName: 'City General Hospital',
  city: 'Skopje',
  note: 'Road traffic accident.',
  status: 'approved',
  createdAt: new Date(Date.now() - 12 * 60_000).toISOString(),
  expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
};

const renderCard = (overrides: Partial<PublicBloodRequest> = {}) =>
  render(
    <MemoryRouter>
      <RequestCard request={{ ...request, ...overrides }} />
    </MemoryRouter>,
  );

describe('RequestCard', () => {
  it('shows the blood type as text, not only as colour', () => {
    const { container } = renderCard();
    expect(container.textContent).toContain('O−');
  });

  it('is a link, so it can be opened in a tab and its URL shared', () => {
    // The card used to be a div with a button inside it: one small target,
    // no middle-click, no URL to send anyone.
    renderCard();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/requests/r1');
  });

  it('names itself by its request, in words a screen reader can say', () => {
    // A feed of seven cards otherwise gives seven links all called "View
    // request". The name says which one — and it has to say "O negative",
    // not the stored "O-", which reads as "O" or "O hyphen".
    renderCard();
    expect(
      screen.getByRole('link', {
        name: 'O negative needed at City General Hospital, Skopje',
      }),
    ).toBeInTheDocument();
  });

  it('never leaks the raw stored value into the announcement', () => {
    renderCard();
    expect(screen.getByRole('link').getAttribute('aria-label')).not.toContain('O-');
  });

  it('shows hospital, city, units and how long ago', () => {
    const { container } = renderCard();
    expect(container.textContent).toContain('City General Hospital');
    expect(container.textContent).toContain('Skopje');
    expect(container.textContent).toContain('3');
    expect(container.textContent).toMatch(/minutes ago/);
  });

  it('says "1 unit", not "1 units"', () => {
    const { container } = renderCard({ unitsNeeded: 1 });
    expect(container.textContent).toContain('1 unit');
    expect(container.textContent).not.toContain('1 units');
  });

  it('carries the urgency as a word, never as colour alone', () => {
    const { container } = renderCard();
    expect(container.textContent).toMatch(/critical/i);
  });

  it('renders without a note', () => {
    const { container } = renderCard({ note: null });
    expect(container.textContent).not.toContain('Road traffic accident.');
  });

  it('renders the card inside the wrapper its container queries need', () => {
    /* An element cannot query its own width, so every @container rule in the
       stylesheet is written against this wrapper. Take it away and all of
       them stop applying at once — no error, no warning, just a card that
       never changes shape again. */
    const { container } = renderCard();
    const shell = container.firstElementChild;
    expect(shell?.tagName).toBe('DIV');
    expect(shell?.firstElementChild).toBe(screen.getByRole('link'));
  });

  it('gives the time a machine-readable datetime', () => {
    const { container } = renderCard();
    expect(container.querySelector('time')).toHaveAttribute(
      'dateTime',
      request.createdAt,
    );
  });
});
