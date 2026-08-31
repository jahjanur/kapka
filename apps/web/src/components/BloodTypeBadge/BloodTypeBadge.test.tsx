import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BLOOD_TYPES, MINUS } from '@kapka/shared';
import { BloodTypeBadge, BloodTypeLabel } from './BloodTypeBadge';

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

describe('sizes', () => {
  it.each(['sm', 'md', 'lg'] as const)('renders at %s while keeping the text', (size) => {
    const { container, unmount } = render(<BloodTypeBadge type="A+" size={size} />);
    expect(container.textContent).toContain('A+');
    expect(container.firstElementChild).toHaveAttribute('data-group', 'A');
    unmount();
  });
});

describe('BloodTypeLabel', () => {
  it('announces the words, not the glyph', () => {
    render(<BloodTypeLabel type="B-" />);
    expect(screen.getByText('B negative')).toBeInTheDocument();
  });

  it('hides the glyph from assistive technology, so it is not read twice', () => {
    const { container } = render(<BloodTypeLabel type="B-" />);
    const glyph = container.querySelector('[aria-hidden="true"]');
    expect(glyph?.textContent).toBe(`B${MINUS}`);
  });

  it.each(BLOOD_TYPES)('gives %s an accessible name that is words', (type) => {
    const { container, unmount } = render(<BloodTypeLabel type={type} />);
    const spoken = container.querySelector('.visually-hidden')?.textContent ?? '';
    expect(spoken).toMatch(/^(O|A|B|A B) (positive|negative)$/);
    unmount();
  });
});
