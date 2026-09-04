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

  it('gives every type the same treatment, and says which it is in words', () => {
    /* The per-group hues are gone: four extra colours on screens that already
       carry a brand colour and two status colours, for something the chip
       writes out in every case. What tells B+ from O− is the text, which is
       also the only channel a screen reader ever had. */
    const { container: ab } = render(<BloodTypeBadge type="AB+" />);
    const { container: o } = render(<BloodTypeBadge type="O-" />);
    expect(ab.firstElementChild).not.toHaveAttribute('data-group');
    expect(ab.firstElementChild?.className).toBe(o.firstElementChild?.className);
    expect(screen.getByText('A B positive')).toBeInTheDocument();
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
