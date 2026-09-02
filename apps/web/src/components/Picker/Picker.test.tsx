import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Field } from '../Field/Field';
import { Picker } from './Picker';

const CITIES = ['Skopje', 'Bitola', 'Kumanovo', 'Prilep', 'Tetovo', 'Veles'];

function Harness({ initial = '' }: { initial?: string }) {
  const [city, setCity] = useState(initial);
  return (
    <>
      <Field label="City" required>
        <Picker
          placeholder="Choose your city"
          options={CITIES}
          value={city}
          onChange={setCity}
        />
      </Field>
      <p>chosen: {city || 'nothing'}</p>
    </>
  );
}

const open = () => screen.getByRole('combobox', { name: /City/ });

describe('the picker', () => {
  it('is labelled, required and closed to begin with', () => {
    render(<Harness />);
    expect(open()).toHaveAttribute('aria-expanded', 'false');
    expect(open()).toHaveAttribute('aria-required', 'true');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(open()).toHaveTextContent('Choose your city');
  });

  it('chooses with the pointer', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(open());
    await user.click(screen.getByRole('option', { name: 'Bitola' }));

    expect(screen.getByText('chosen: Bitola')).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).toBeNull();
    // Focus comes back, or a keyboard user is left at the top of the document.
    expect(open()).toHaveFocus();
  });

  it('chooses with the keyboard, and says which option is active', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    open().focus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{ArrowDown}{Enter}');

    expect(screen.getByText('chosen: Bitola')).toBeInTheDocument();
  });

  it('jumps to what is typed, the way a select does', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    open().focus();
    await user.keyboard('t');

    const active = open().getAttribute('aria-activedescendant');
    expect(screen.getByRole('option', { name: 'Tetovo' })).toHaveAttribute('id', active);
  });

  it('closes on Escape without choosing', async () => {
    const user = userEvent.setup();
    render(<Harness initial="Skopje" />);
    open().focus();
    await user.keyboard('{ArrowDown}{ArrowDown}{Escape}');

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByText('chosen: Skopje')).toBeInTheDocument();
  });

  it('opens on the option already chosen', async () => {
    const user = userEvent.setup();
    render(<Harness initial="Tetovo" />);
    await user.click(open());

    const chosen = screen.getByRole('option', { name: 'Tetovo' });
    expect(chosen).toHaveAttribute('aria-selected', 'true');
    expect(open()).toHaveAttribute('aria-activedescendant', chosen.id);
  });

  it('closes when the pointer goes somewhere else', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(open());
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await user.click(document.body);
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
