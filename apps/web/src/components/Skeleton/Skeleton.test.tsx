import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RequestCardSkeleton } from '../RequestCard/RequestCard';
import { Skeleton } from './Skeleton';

describe('Skeleton', () => {
  it('takes the size of the thing it stands in for', () => {
    // Width and height are the only things a caller sets: they describe the
    // specific content being waited for.
    const { container } = render(<Skeleton width="80%" height="1.4rem" />);
    const block = container.firstElementChild as HTMLElement;
    expect(block.style.inlineSize).toBe('80%');
    expect(block.style.blockSize).toBe('1.4rem');
  });

  it('carries no static styling in the style attribute', () => {
    /* display used to be set inline. A value that is the same for every
       skeleton is not the caller's business and belongs in the stylesheet. */
    const { container } = render(<Skeleton width="4rem" />);
    expect((container.firstElementChild as HTMLElement).style.display).toBe('');
  });

  it('is silent to a screen reader', () => {
    // There is nothing to announce about a placeholder, and announcing one
    // per line would bury the thing being waited for.
    const { container } = render(<Skeleton width="4rem" />);
    expect(container.textContent).toBe('');
  });
});

describe('the request card skeleton', () => {
  it('is built from the card’s own classes, not a description of them', () => {
    /* This is what stops it drifting. The one that used to live in Feed.tsx
       described the card from memory, and when the card grew a container
       shell and three width bands the skeleton kept the old shape. */
    const { container } = render(<RequestCardSkeleton />);
    const shell = container.firstElementChild;
    const card = shell?.firstElementChild;

    expect(shell?.className).toBeTruthy();
    expect(card?.className).toBeTruthy();
    // The same wrapper the real card has, which is what the container
    // queries are written against.
    expect(shell?.tagName).toBe('DIV');
    expect(card?.tagName).toBe('DIV');
  });

  it('says nothing, and offers nothing to click', () => {
    render(<RequestCardSkeleton />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('is hidden from assistive technology as a whole', () => {
    // Seven of these in a grid would otherwise be seven announcements of
    // nothing while the feed loads.
    const { container } = render(<RequestCardSkeleton />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });
});
