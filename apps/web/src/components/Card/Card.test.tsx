import type { SyntheticEvent } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Card } from './Card';

describe('as a surface', () => {
  it('renders its children', () => {
    render(<Card>Clinical Hospital Bitola</Card>);
    expect(screen.getByText('Clinical Hospital Bitola')).toBeInTheDocument();
  });

  it('is a plain div when it is not interactive', () => {
    // A non-interactive card is decoration around content. It should not be
    // focusable, and it should not be announced as a control.
    const { container } = render(<Card>content</Card>);
    expect(container.firstElementChild?.tagName).toBe('DIV');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('sets no outer margin of its own (§8 ground rule 3)', () => {
    const { container } = render(<Card>content</Card>);
    const style = (container.firstElementChild as HTMLElement).style;
    expect(style.margin).toBe('');
    expect(style.marginBlockStart).toBe('');
  });

  it.each(['flush', 'tight', 'roomy'] as const)(
    'applies the %s padding variant',
    (padding) => {
      const { container } = render(<Card padding={padding}>content</Card>);
      expect(container.firstElementChild?.className).toMatch(new RegExp(padding));
    },
  );

  it('leaves the default padding unmarked, rather than adding a redundant class', () => {
    const { container } = render(<Card>content</Card>);
    expect(container.firstElementChild?.className).not.toMatch(/flush|tight|roomy/);
  });

  it('applies the muted tone for a card nested in another card', () => {
    const { container } = render(<Card tone="alt">content</Card>);
    expect(container.firstElementChild?.className).toMatch(/alt/);
  });
});

describe('as a control', () => {
  it('becomes a real button when interactive, without being asked', () => {
    // An interactive <div> looks clickable, responds to hover and press, and
    // is invisible to the keyboard and to a screen reader. Nothing errors —
    // it just cannot be used without a mouse.
    render(<Card interactive>View request</Card>);
    expect(screen.getByRole('button', { name: 'View request' })).toBeInTheDocument();
  });

  it('is reachable by Tab', async () => {
    render(<Card interactive>View request</Card>);
    await userEvent.tab();
    expect(screen.getByRole('button')).toHaveFocus();
  });

  it('activates with the keyboard, not only with a mouse', async () => {
    const onClick = vi.fn();
    render(
      <Card interactive onClick={onClick}>
        View request
      </Card>,
    );
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
    await userEvent.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('does not submit a surrounding form', async () => {
    // HTML defaults a button to type="submit". A card-as-button inside a form
    // would post it on every click.
    const onSubmit = vi.fn((event: SyntheticEvent) => {
      event.preventDefault();
    });
    render(
      <form onSubmit={onSubmit}>
        <Card interactive>View request</Card>
      </form>,
    );
    await userEvent.click(screen.getByRole('button'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('still allows an explicit submit when that is what is wanted', async () => {
    const onSubmit = vi.fn((event: SyntheticEvent) => {
      event.preventDefault();
    });
    render(
      <form onSubmit={onSubmit}>
        <Card interactive type="submit">
          Post
        </Card>
      </form>,
    );
    await userEvent.click(screen.getByRole('button'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('honours an explicit element when the caller has a better one', () => {
    // A card that navigates should be a link, not a button.
    render(
      <Card interactive as="a" href="/requests/r1">
        View request
      </Card>,
    );
    const link = screen.getByRole('link', { name: 'View request' });
    expect(link).toHaveAttribute('href', '/requests/r1');
    // type belongs to buttons only; it must not leak onto an anchor.
    expect(link).not.toHaveAttribute('type');
  });

  it('does not put a type attribute on a non-button element', () => {
    const { container } = render(<Card>content</Card>);
    expect(container.firstElementChild).not.toHaveAttribute('type');
  });
});
