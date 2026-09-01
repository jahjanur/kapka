import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Modal, Sheet } from './Modal';

/*
 * What is covered here is this component's wiring: that it opens and closes in
 * step with its prop, that every exit ends at onClose, and that focus goes
 * back where it came from.
 *
 * What is NOT covered, and cannot be in jsdom, is the focus trap itself and
 * Escape. Both belong to <dialog>, which jsdom does not implement at all —
 * test/setup.ts shims just enough of the spec for these tests to run, and
 * deliberately does not fake a trap, because a test passing against that shim
 * would say nothing about a browser. Delegating the trap is the reason this
 * component is built on showModal in the first place.
 */

function Harness({
  dismissible = true,
  onClose,
}: {
  dismissible?: boolean;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open it
      </button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          onClose?.();
        }}
        title="Email 23 donors?"
        dismissible={dismissible}
        footer={<button type="button">Confirm</button>}
      >
        <p>This cannot be undone.</p>
      </Modal>
    </>
  );
}

describe('Modal', () => {
  it('is closed until it is asked to open', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByRole('dialog', { hidden: true })).not.toHaveAttribute('open');

    await user.click(screen.getByRole('button', { name: 'Open it' }));
    expect(screen.getByRole('dialog')).toHaveAttribute('open');
  });

  it('is named by its title, not by its contents', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open it' }));

    expect(screen.getByRole('dialog', { name: 'Email 23 donors?' })).toBeInTheDocument();
  });

  it('closes through the close button', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Harness onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Open it' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog', { hidden: true })).not.toHaveAttribute('open');
  });

  it('closes when the backdrop is clicked', async () => {
    /* A click on the backdrop targets the dialog element itself; a click on
       anything inside targets that. */
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Harness onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Open it' }));

    await user.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores a click on its own contents', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Harness onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Open it' }));

    await user.click(screen.getByText('This cannot be undone.'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('gives focus back to whatever opened it', async () => {
    /* Not this component's own doing — the browser restores focus on close,
       and the shim mirrors that rule. What is being checked is that nothing
       here gets in the way of it. */
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open it' });

    await user.click(opener);
    expect(document.activeElement).not.toBe(opener);

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(document.activeElement).toBe(opener);
  });

  it('offers no way out when it must not be dismissed', async () => {
    // For a decision that has to be made rather than avoided.
    const user = userEvent.setup();
    render(<Harness dismissible={false} />);
    await user.click(screen.getByRole('button', { name: 'Open it' }));

    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('refuses the Escape key when it must not be dismissed', async () => {
    /* Escape arrives as `cancel` before the dialog closes; refusing it there
       is what makes dismissible={false} hold. jsdom does not fire it, so the
       event stands in for the browser and what is checked is the gate. */
    const user = userEvent.setup();
    render(<Harness dismissible={false} />);
    await user.click(screen.getByRole('button', { name: 'Open it' }));

    const dialog = screen.getByRole('dialog');
    const cancel = new Event('cancel', { cancelable: true, bubbles: true });
    dialog.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
  });

  it('allows the Escape key when it may be dismissed', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open it' }));

    const cancel = new Event('cancel', { cancelable: true, bubbles: true });
    screen.getByRole('dialog').dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(false);
  });

  it('is the same dialog when it is a sheet', () => {
    // Not a second implementation: two overlays would be two focus traps.
    render(
      <Sheet open onClose={() => undefined} title="Filters">
        <p>Body</p>
      </Sheet>,
    );
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument();
  });
});
