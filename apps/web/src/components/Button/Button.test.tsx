import type { SyntheticEvent } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('variants and sizes', () => {
  it.each(['primary', 'secondary', 'ghost', 'danger'] as const)(
    'renders the %s variant',
    (variant) => {
      render(<Button variant={variant}>Post request</Button>);
      expect(screen.getByRole('button', { name: 'Post request' })).toBeInTheDocument();
    },
  );

  it.each(['sm', 'md', 'lg'] as const)('renders the %s size', (size) => {
    render(<Button size={size}>Post request</Button>);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('defaults to type="button"', () => {
    // A Button dropped into a form must not submit it by accident. HTML
    // defaults to submit; this component does not.
    render(<Button>Cancel</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });
});

describe('disabled', () => {
  it('does not fire onClick', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Post
      </Button>,
    );
    await userEvent.click(screen.getByRole('button'), { pointerEventsCheck: 0 });
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('loading', () => {
  it('does not fire onClick', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Post
      </Button>,
    );
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('does not submit the surrounding form', async () => {
    // The whole point of a loading state is stopping a second submission.
    // Blocking onClick is not enough: a type="submit" button submits its form
    // natively, with no onClick involved.
    const onSubmit = vi.fn((event: SyntheticEvent) => {
      event.preventDefault();
    });
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit" loading>
          Post request
        </Button>
      </form>,
    );
    await userEvent.click(screen.getByRole('button'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('still submits when not loading, so the guard is not just breaking it', async () => {
    const onSubmit = vi.fn((event: SyntheticEvent) => {
      event.preventDefault();
    });
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit">Post request</Button>
      </form>,
    );
    await userEvent.click(screen.getByRole('button'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('announces itself as busy', () => {
    render(<Button loading>Post</Button>);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAttribute('aria-disabled', 'true');
  });

  it('stays focusable, so a keyboard user is not dumped back to the body', () => {
    render(<Button loading>Post</Button>);
    expect(screen.getByRole('button')).not.toBeDisabled();
  });

  it('gives a screen reader something to hear while it waits', () => {
    render(
      <Button loading loadingLabel="Posting your request…">
        Post
      </Button>,
    );
    expect(screen.getByText('Posting your request…')).toBeInTheDocument();
  });

  it('keeps the label in the DOM, which is what preserves the width', () => {
    // The label is hidden with visibility, not removed — it keeps occupying
    // its box so the button cannot resize mid-action and shove the layout.
    render(<Button loading>Post request</Button>);
    expect(screen.getByText('Post request')).toBeInTheDocument();
  });
});

describe('pass-through', () => {
  it('forwards arbitrary attributes', () => {
    render(
      <Button aria-describedby="hint" data-testid="x">
        Post
      </Button>,
    );
    const button = screen.getByTestId('x');
    expect(button).toHaveAttribute('aria-describedby', 'hint');
  });

  it('fires onClick in the normal case', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Post</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
