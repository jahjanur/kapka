import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from './ToastProvider';
import { useToast, type ToastOptions } from './toastContext';

function Trigger({ message, options }: { message: string; options?: ToastOptions }) {
  const { show } = useToast();
  return (
    <button type="button" onClick={() => show(message, options)}>
      Say it
    </button>
  );
}

const renderWithProvider = (ui: React.ReactNode) =>
  render(<ToastProvider>{ui}</ToastProvider>);

afterEach(() => {
  vi.useRealTimers();
});

describe('Toast', () => {
  it('shows what it was told to show', async () => {
    const user = userEvent.setup();
    renderWithProvider(<Trigger message="Your details are saved." />);
    await user.click(screen.getByRole('button', { name: 'Say it' }));

    expect(screen.getByText('Your details are saved.')).toBeInTheDocument();
  });

  it('never takes focus', async () => {
    /* Moving focus to something that disappears on a timer strands a keyboard
       user on an element that no longer exists, to tell them a thing they did
       worked. The live region does the telling. */
    const user = userEvent.setup();
    renderWithProvider(<Trigger message="Saved." />);
    const button = screen.getByRole('button', { name: 'Say it' });

    await user.click(button);
    expect(document.activeElement).toBe(button);
  });

  it('announces politely by default', async () => {
    const user = userEvent.setup();
    renderWithProvider(<Trigger message="Saved." />);
    await user.click(screen.getByRole('button', { name: 'Say it' }));

    const region = screen.getByText('Saved.').closest('[aria-live]');
    expect(region).toHaveAttribute('aria-live', 'polite');
  });

  it('interrupts for a failure, because a failure has to be acted on', async () => {
    const user = userEvent.setup();
    renderWithProvider(
      <Trigger message="That did not send." options={{ tone: 'error' }} />,
    );
    await user.click(screen.getByRole('button', { name: 'Say it' }));

    const region = screen.getByText('That did not send.').closest('[aria-live]');
    expect(region).toHaveAttribute('aria-live', 'assertive');
  });

  it('goes away on its own', () => {
    /* fireEvent rather than userEvent: userEvent's own internal delays never
       resolve against fake timers, and the timer is the thing under test. */
    vi.useFakeTimers();
    renderWithProvider(<Trigger message="Saved." />);
    fireEvent.click(screen.getByRole('button', { name: 'Say it' }));
    expect(screen.getByText('Saved.')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText('Saved.')).toBeNull();
  });

  it('leaves an error on screen until it is dismissed', () => {
    // Taking a failure away after five seconds is how one goes unnoticed.
    vi.useFakeTimers();
    renderWithProvider(
      <Trigger message="That did not send." options={{ tone: 'error' }} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Say it' }));

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText('That did not send.')).toBeInTheDocument();
  });

  it('can be dismissed by hand', async () => {
    const user = userEvent.setup();
    renderWithProvider(<Trigger message="Saved." />);
    await user.click(screen.getByRole('button', { name: 'Say it' }));
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(screen.queryByText('Saved.')).toBeNull();
  });

  it('stacks rather than replacing', async () => {
    const user = userEvent.setup();
    renderWithProvider(
      <>
        <Trigger message="First." />
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'Say it' }));
    await user.click(screen.getByRole('button', { name: 'Say it' }));

    expect(screen.getAllByText('First.')).toHaveLength(2);
  });

  it('refuses to be used without its provider', () => {
    // A silent no-op would mean messages that simply never appear.
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Trigger message="Saved." />)).toThrow(/ToastProvider/);
    quiet.mockRestore();
  });
});
