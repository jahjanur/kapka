import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from '../Button/Button';
import { EmptyState } from './EmptyState';

/*
 * The contract §9.7 asks for: a headline, one sentence, one action. The first
 * is required by the type; the other two are conventions this pins down, so
 * that a second paragraph or a row of three buttons has to be a decision
 * somebody makes rather than something that drifts in.
 */

describe('EmptyState', () => {
  it('leads with a headline, as a heading and not as bold text', () => {
    // A screen reader skimming by heading has to find it.
    render(<EmptyState headline="No open requests right now" />);
    expect(
      screen.getByRole('heading', { name: 'No open requests right now' }),
    ).toBeInTheDocument();
  });

  it('says one sentence, in one paragraph', () => {
    const { container } = render(
      <EmptyState
        headline="Nothing here"
        body="Widen the search and they will reappear."
      />,
    );
    expect(container.querySelectorAll('p')).toHaveLength(1);
    expect(
      screen.getByText('Widen the search and they will reappear.'),
    ).toBeInTheDocument();
  });

  it('says nothing at all rather than an empty paragraph', () => {
    // A headline on its own is a complete empty state.
    const { container } = render(<EmptyState headline="Nothing here" />);
    expect(container.querySelectorAll('p')).toHaveLength(0);
  });

  it('carries one action, and renders it as given', () => {
    /* The action is a slot rather than a label-and-onClick pair, so a screen
       can pass a link where a link is right — which the feed does, because
       "Register as donor" has a URL. */
    render(
      <MemoryRouter>
        <EmptyState
          headline="Nothing here"
          action={<Button to="/register">Register as donor</Button>}
        />
      </MemoryRouter>,
    );
    const action = screen.getByRole('link', { name: 'Register as donor' });
    expect(action).toHaveAttribute('href', '/register');
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('shows an icon without announcing it', () => {
    // It is decoration beside a heading that already says the thing.
    const { container } = render(<EmptyState headline="Nothing here" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });
});
