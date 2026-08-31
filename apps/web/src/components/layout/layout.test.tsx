import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Cluster, Container, Grid, Stack, WithSidebar } from './index';

/**
 * The primitives pass their configuration to CSS through inline custom
 * properties. That handoff is invisible when it breaks — a wrong or missing
 * property just falls back to the default in the stylesheet, and the layout
 * looks plausible but wrong.
 */

const styleOf = (el: Element | null) => (el as HTMLElement | null)?.style;

describe('Stack', () => {
  it('passes the gap step through as --flow', () => {
    const { container } = render(<Stack gap={6}>content</Stack>);
    expect(styleOf(container.firstElementChild)?.getPropertyValue('--flow')).toBe(
      'var(--space-6)',
    );
  });

  it('defaults to a gap rather than collapsing to nothing', () => {
    const { container } = render(<Stack>content</Stack>);
    expect(styleOf(container.firstElementChild)?.getPropertyValue('--flow')).toBe(
      'var(--space-4)',
    );
  });

  it('renders as the requested element, so it can be a real landmark', () => {
    const { container } = render(<Stack as="section">content</Stack>);
    expect(container.firstElementChild?.tagName).toBe('SECTION');
  });

  it('sets no outer margin of its own (§8 ground rule 3)', () => {
    // Spacing is the parent's job. A primitive that set its own margin would
    // stop composing the moment it was nested in something else.
    const { container } = render(<Stack gap={4}>content</Stack>);
    const style = styleOf(container.firstElementChild);
    expect(style?.margin).toBe('');
    expect(style?.marginTop).toBe('');
    expect(style?.marginBlockStart).toBe('');
  });

  it('keeps caller-supplied styles alongside its own', () => {
    const { container } = render(
      <Stack gap={2} style={{ opacity: '0.5' }}>
        x
      </Stack>,
    );
    const style = styleOf(container.firstElementChild);
    expect(style?.getPropertyValue('--flow')).toBe('var(--space-2)');
    expect(style?.opacity).toBe('0.5');
  });
});

describe('Cluster', () => {
  it('maps semantic alignment onto CSS values', () => {
    // The prop is `start`, the CSS needs `flex-start` — a mismatch here is a
    // silently ignored declaration.
    const { container } = render(
      <Cluster align="start" justify="between">
        x
      </Cluster>,
    );
    const style = styleOf(container.firstElementChild);
    expect(style?.getPropertyValue('--align')).toBe('flex-start');
    expect(style?.getPropertyValue('--justify')).toBe('space-between');
  });

  it('centres and left-aligns by default', () => {
    const { container } = render(<Cluster>x</Cluster>);
    const style = styleOf(container.firstElementChild);
    expect(style?.getPropertyValue('--align')).toBe('center');
    expect(style?.getPropertyValue('--justify')).toBe('flex-start');
  });

  it('uses a tighter default gap than Stack, since it is a row of chips', () => {
    const { container } = render(<Cluster>x</Cluster>);
    expect(styleOf(container.firstElementChild)?.getPropertyValue('--gap')).toBe(
      'var(--space-2)',
    );
  });
});

describe('Container', () => {
  it('caps at the shared max width by default', () => {
    const { container } = render(<Container>x</Container>);
    expect(
      styleOf(container.firstElementChild)?.getPropertyValue('--container-width'),
    ).toBe('var(--container-max)');
  });

  it('narrows for prose, so line length stays readable (§6.4)', () => {
    const { container } = render(<Container width="text">x</Container>);
    expect(
      styleOf(container.firstElementChild)?.getPropertyValue('--container-width'),
    ).toBe('48rem');
  });
});

describe('Grid', () => {
  it('passes the minimum column width through, which is what removes the media query', () => {
    // repeat(auto-fit, minmax(min(--col-min, 100%), 1fr)) reflows on its own.
    const { container } = render(
      <Grid minColumn="24rem" gap={6}>
        x
      </Grid>,
    );
    const style = styleOf(container.firstElementChild);
    expect(style?.getPropertyValue('--col-min')).toBe('24rem');
    expect(style?.getPropertyValue('--gap')).toBe('var(--space-6)');
  });

  it('has a sensible default column width', () => {
    const { container } = render(<Grid>x</Grid>);
    expect(styleOf(container.firstElementChild)?.getPropertyValue('--col-min')).toBe(
      '18rem',
    );
  });
});

describe('WithSidebar', () => {
  it('renders both slots', () => {
    render(
      <WithSidebar sidebar={<p>filters</p>}>
        <p>results</p>
      </WithSidebar>,
    );
    expect(screen.getByText('filters')).toBeInTheDocument();
    expect(screen.getByText('results')).toBeInTheDocument();
  });

  it('puts the sidebar first in the DOM, so it is first for a screen reader', () => {
    const { container } = render(
      <WithSidebar sidebar={<p>filters</p>}>
        <p>results</p>
      </WithSidebar>,
    );
    expect(container.firstElementChild?.firstElementChild?.textContent).toBe('filters');
  });

  it('passes the widths that decide when it wraps', () => {
    // The pair collapses to one column on its own when main cannot hold its
    // basis — no breakpoint involved.
    const { container } = render(
      <WithSidebar sidebar={<p>s</p>} sidebarWidth="16rem" mainMin="30rem">
        <p>m</p>
      </WithSidebar>,
    );
    const style = styleOf(container.firstElementChild);
    expect(style?.getPropertyValue('--sidebar-basis')).toBe('16rem');
    expect(style?.getPropertyValue('--main-min')).toBe('30rem');
  });

  it('can move the sidebar to the trailing side without reordering the DOM', () => {
    const { container } = render(
      <WithSidebar sidebar={<p>filters</p>} side="end">
        <p>results</p>
      </WithSidebar>,
    );
    // Still first in source order; only the visual order changes.
    expect(container.firstElementChild?.firstElementChild?.textContent).toBe('filters');
    expect(container.firstElementChild?.firstElementChild?.className).toMatch(
      /sidebarLast/,
    );
  });
});
