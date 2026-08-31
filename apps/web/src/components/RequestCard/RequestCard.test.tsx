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

describe('RequestCard', () => {
  it('shows the blood type as text, not only as colour', () => {
    const { container } = render(<RequestCard request={request} />);
    expect(container.textContent).toContain('O−');
  });

  it('names the action button by its request, in words a screen reader can say', () => {
    // A feed of seven cards otherwise gives seven buttons all called "View
    // request". The description says which one — and it has to say
    // "O negative", not the stored "O-", which reads as "O" or "O hyphen".
    render(<RequestCard request={request} />);
    const button = screen.getByRole('button', { name: /View request/ });
    expect(button).toHaveAccessibleDescription(
      'O negative at City General Hospital, Skopje',
    );
  });

  it('never leaks the raw stored value into the announcement', () => {
    const { container } = render(<RequestCard request={request} />);
    const hidden = container.querySelector('.visually-hidden[id^="req-"]');
    expect(hidden?.textContent).not.toContain('O-');
  });

  it('shows hospital, city, units and how long ago', () => {
    const { container } = render(<RequestCard request={request} />);
    expect(
      screen.getByRole('heading', { name: 'City General Hospital' }),
    ).toBeInTheDocument();
    expect(container.textContent).toContain('Skopje');
    expect(container.textContent).toContain('3 units');
    expect(container.textContent).toContain('12 minutes ago');
  });

  it('says "1 unit", not "1 units"', () => {
    const { container } = render(
      <RequestCard request={{ ...request, unitsNeeded: 1 }} />,
    );
    expect(container.textContent).toContain('1 unit');
    expect(container.textContent).not.toContain('1 units');
  });

  it('carries the urgency as a word, never as colour alone', () => {
    const { container } = render(<RequestCard request={request} />);
    expect(container.textContent).toContain('Critical');
  });

  it('renders without a note', () => {
    const { container } = render(<RequestCard request={{ ...request, note: null }} />);
    expect(container.textContent).not.toContain('Road traffic accident.');
  });

  it('gives the time a machine-readable datetime', () => {
    const { container } = render(<RequestCard request={request} />);
    expect(container.querySelector('time')).toHaveAttribute(
      'dateTime',
      request.createdAt,
    );
  });
});
