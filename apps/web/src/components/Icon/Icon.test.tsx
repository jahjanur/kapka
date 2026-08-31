import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Icon, ICON_NAMES, IconSprite } from './Icon';
import { ICONS } from './icons';

describe('the sprite', () => {
  it('defines a symbol for every icon the type allows', () => {
    // <Icon name="x"> renders <use href="#kapka-x">. A name with no symbol
    // renders nothing at all — no error, no warning, an invisible gap.
    const { container } = render(<IconSprite />);
    for (const name of ICON_NAMES) {
      expect(container.querySelector(`#kapka-${name}`), name).not.toBeNull();
    }
  });

  it('gives every symbol a unique id', () => {
    const { container } = render(<IconSprite />);
    const ids = [...container.querySelectorAll('symbol')].map((s) => s.id);
    expect(ids).toHaveLength(ICON_NAMES.length);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps every symbol on the same 24x24 grid', () => {
    // A mismatched viewBox makes one icon render at a different optical size
    // than its neighbours, which reads as a mistake rather than a choice.
    const { container } = render(<IconSprite />);
    for (const symbol of container.querySelectorAll('symbol')) {
      expect(symbol.getAttribute('viewBox'), symbol.id).toBe('0 0 24 24');
    }
  });

  it('is hidden from assistive technology', () => {
    // It is a definition list, not content. A screen reader must not walk it.
    const { container } = render(<IconSprite />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps ICON_NAMES in step with ICONS', () => {
    expect([...ICON_NAMES].sort()).toEqual(Object.keys(ICONS).sort());
  });
});

describe('colour and size come from the outside', () => {
  it('hard-codes no colour in any glyph', () => {
    // Every icon inherits currentColor. A fill="#333" anywhere would look
    // fine in the light theme and wrong in the dark one.
    const { container } = render(<IconSprite />);
    const markup = container.innerHTML;
    expect(markup).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(markup).not.toMatch(/(fill|stroke)="(?!none)(?!currentColor)[a-z]/i);
  });

  it('sizes in em, so an icon matches the text beside it', () => {
    const { container } = render(<Icon name="droplet" size={1.5} />);
    const svg = container.querySelector('svg');
    expect(svg?.style.getPropertyValue('--icon-size')).toBe('1.5em');
  });

  it('leaves the size to CSS when none is given', () => {
    const { container } = render(<Icon name="droplet" />);
    expect(container.querySelector('svg')?.style.getPropertyValue('--icon-size')).toBe(
      '',
    );
  });
});

describe('accessibility', () => {
  it('is decorative by default', () => {
    // An icon beside a text label must not be read out — the label already
    // says it. This is the common case, so it is the default.
    const { container } = render(<Icon name="mapPin" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).not.toHaveAttribute('role');
  });

  it('becomes an image with a name when it carries meaning alone', () => {
    render(<Icon name="alertTriangle" label="Critical" />);
    expect(screen.getByRole('img', { name: 'Critical' })).toBeInTheDocument();
  });

  it('is never focusable, even in browsers that make SVG focusable', () => {
    const { container } = render(<Icon name="close" />);
    expect(container.querySelector('svg')).toHaveAttribute('focusable', 'false');
  });

  it('points at the symbol matching its name', () => {
    const { container } = render(<Icon name="chevronRight" />);
    expect(container.querySelector('use')).toHaveAttribute('href', '#kapka-chevronRight');
  });
});

describe('the sprite is mounted once, for the whole app', () => {
  it('is not rendered by individual routes', async () => {
    // Leaving it to each route meant a new route was one forgotten line away
    // from rendering every icon blank.
    const { readFileSync, readdirSync } = await import('node:fs');
    const dir = 'apps/web/src/routes/';
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.tsx'))) {
      expect(readFileSync(dir + file, 'utf8'), file).not.toMatch(/<IconSprite/);
    }
  });
});
