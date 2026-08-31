import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BLOOD_TYPES, MINUS } from '@kapka/shared';
import { BloodTypeBadge } from './BloodTypeBadge';

describe('BloodTypeBadge', () => {
  it('always shows the literal type, so colour is never the only channel (§10)', () => {
    const { container } = render(<BloodTypeBadge type="O-" />);
    expect(container.textContent).toContain(`O${MINUS}`);
  });

  it('announces "O negative", not "O minus"', () => {
    render(<BloodTypeBadge type="O-" />);
    expect(screen.getByText('O negative')).toBeInTheDocument();
  });

  it('carries the group and Rh sign as data attributes for the fill/outline rule', () => {
    const { container } = render(<BloodTypeBadge type="AB+" />);
    const badge = container.firstElementChild;
    expect(badge).toHaveAttribute('data-group', 'AB');
    expect(badge).toHaveAttribute('data-rh', 'positive');
  });

  it('distinguishes Rh sign by attribute, not only by colour', () => {
    const { container: neg } = render(<BloodTypeBadge type="B-" />);
    const { container: pos } = render(<BloodTypeBadge type="B+" />);
    expect(neg.firstElementChild).toHaveAttribute('data-rh', 'negative');
    expect(pos.firstElementChild).toHaveAttribute('data-rh', 'positive');
  });

  it('renders every one of the eight types without a hyphen leaking through', () => {
    for (const type of BLOOD_TYPES) {
      const { container, unmount } = render(<BloodTypeBadge type={type} />);
      const visible = container.querySelector('[aria-hidden="true"]');
      expect(visible?.textContent).not.toContain('-');
      unmount();
    }
  });
});
