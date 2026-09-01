import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OfflineBanner } from './OfflineBanner';

/** navigator.onLine is read-only; jsdom lets it be redefined. */
function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => value,
  });
  window.dispatchEvent(new Event(value ? 'online' : 'offline'));
}

beforeEach(() => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the offline banner', () => {
  it('says nothing while there is a connection', () => {
    const { container } = render(<OfflineBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says so when the connection goes, and that nothing was lost', () => {
    /* Someone who loses signal mid-form needs to know their typing is still
       there before anything else. */
    render(<OfflineBanner />);
    act(() => setOnline(false));

    expect(screen.getByRole('status')).toHaveTextContent('You are offline');
    expect(screen.getByRole('status')).toHaveTextContent(/still here/);
  });

  it('announces politely rather than interrupting', () => {
    // A lost signal is not worth cutting across whatever a screen reader is
    // in the middle of saying, and the message stays while it is true.
    render(<OfflineBanner />);
    act(() => setOnline(false));
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('says when the connection comes back, then gets out of the way', () => {
    /* Without this, somebody who lost signal mid-form has no idea whether it
       is safe to press the button again — and on the request form that
       button emails strangers. */
    vi.useFakeTimers();
    render(<OfflineBanner />);
    act(() => setOnline(false));
    act(() => setOnline(true));

    expect(screen.getByRole('status')).toHaveTextContent('Back online');

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('does not congratulate a connection that never dropped', () => {
    // The `online` event only fires after an absence, which is what makes
    // this need no flag of its own.
    render(<OfflineBanner />);
    expect(screen.queryByText(/Back online/)).toBeNull();
  });

  it('drops the back-online message if the signal goes again first', () => {
    vi.useFakeTimers();
    render(<OfflineBanner />);
    act(() => setOnline(false));
    act(() => setOnline(true));
    act(() => setOnline(false));

    expect(screen.getByRole('status')).toHaveTextContent('You are offline');
  });
});
