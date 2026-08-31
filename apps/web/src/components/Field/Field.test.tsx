import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Field } from './Field';
import { Input } from '../Input/Input';
import { Textarea } from '../Input/Textarea';
import { Select } from '../Select/Select';

/**
 * Field owns the association between a label, its control, and the help and
 * error text describing it. Every one of those links is invisible when it
 * breaks: the form still renders and still works with a mouse, and only a
 * screen reader user finds out the control has no name.
 */

describe('label association', () => {
  it('associates the label with an Input', () => {
    // getByLabelText resolves the same way an assistive technology does, so
    // this passing means the control genuinely has an accessible name.
    render(
      <Field label="Full name">
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText('Full name')).toBeInstanceOf(HTMLInputElement);
  });

  it('associates the label with a Textarea', () => {
    render(
      <Field label="Note to donors">
        <Textarea />
      </Field>,
    );
    expect(screen.getByLabelText('Note to donors')).toBeInstanceOf(HTMLTextAreaElement);
  });

  it('associates the label with a Select', () => {
    render(
      <Field label="City">
        <Select>
          <option value="Skopje">Skopje</option>
        </Select>
      </Field>,
    );
    expect(screen.getByLabelText('City')).toBeInstanceOf(HTMLSelectElement);
  });

  it('gives each Field its own id, so two on one page do not collide', () => {
    render(
      <>
        <Field label="City">
          <Input />
        </Field>
        <Field label="Hospital">
          <Input />
        </Field>
      </>,
    );
    const city = screen.getByLabelText('City');
    const hospital = screen.getByLabelText('Hospital');
    expect(city.id).not.toBe(hospital.id);
    expect(city.id).toBeTruthy();
  });
});

describe('help and error text', () => {
  it('describes the control with its help text', () => {
    render(
      <Field label="Email" help="We only email you when a matching request is approved.">
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription(
      'We only email you when a matching request is approved.',
    );
  });

  it('describes the control with its error text', () => {
    render(
      <Field label="Password" error="Use at least 10 characters.">
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(
      'Use at least 10 characters.',
    );
  });

  it('describes it with both at once, in reading order', () => {
    render(
      <Field label="Password" help="Ten characters or more." error="Too short.">
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(
      'Ten characters or more. Too short.',
    );
  });

  it('adds no description when there is neither', () => {
    render(
      <Field label="Phone">
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText('Phone')).not.toHaveAttribute('aria-describedby');
  });

  it('puts the error in a live region so it is announced when it appears', () => {
    // On blur validation the error arrives after focus has moved on. Without
    // a live region nobody hears it.
    const { container, rerender } = render(
      <Field label="Email">
        <Input />
      </Field>,
    );
    const live = container.querySelector('[aria-live="polite"]');
    expect(live).toBeInTheDocument();
    expect(live?.textContent).toBe('');

    rerender(
      <Field label="Email" error="Enter a valid email address.">
        <Input />
      </Field>,
    );
    expect(live?.textContent).toContain('Enter a valid email address.');
  });
});

describe('invalid state', () => {
  it('marks the control invalid only when there is an error', () => {
    const { rerender } = render(
      <Field label="Email">
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid');

    rerender(
      <Field label="Email" error="Enter a valid email address.">
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it.each([
    ['Input', <Input key="i" />],
    ['Textarea', <Textarea key="t" />],
  ])('marks a %s invalid too', (_name, control) => {
    render(
      <Field label="Thing" error="Nope.">
        {control}
      </Field>,
    );
    expect(screen.getByLabelText('Thing')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('required and optional', () => {
  it('communicates required to a screen reader, not just with an asterisk', () => {
    // A bare * is decoration. The control itself has to carry the state.
    render(
      <Field label="Full name" required>
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText(/Full name/)).toBeRequired();
  });

  it('hides the decorative asterisk from assistive technology', () => {
    const { container } = render(
      <Field label="Full name" required>
        <Input />
      </Field>,
    );
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe('*');
    expect(screen.getByText('(required)')).toBeInTheDocument();
  });

  it('marks optional fields in the label rather than leaving it silent', () => {
    render(
      <Field label="Phone" optional>
        <Input />
      </Field>,
    );
    expect(screen.getByText('Optional')).toBeInTheDocument();
  });

  it('does not say both required and optional', () => {
    render(
      <Field label="Phone" required optional>
        <Input />
      </Field>,
    );
    expect(screen.queryByText('Optional')).not.toBeInTheDocument();
  });
});

describe('controls used outside a Field', () => {
  it('render without crashing and claim no id they do not own', () => {
    render(<Input aria-label="standalone" />);
    const input = screen.getByLabelText('standalone');
    expect(input).not.toHaveAttribute('aria-describedby');
    expect(input.id).toBe('');
  });
});

describe('Select specifics', () => {
  it('offers the placeholder as an unselectable first option', () => {
    render(
      <Field label="City">
        <Select placeholder="Select a city" defaultValue="">
          <option value="Skopje">Skopje</option>
        </Select>
      </Field>,
    );
    const placeholder = screen.getByRole('option', { name: 'Select a city' });
    expect(placeholder).toBeDisabled();
  });

  it('marks itself as showing a placeholder so the styling can dim it', () => {
    render(
      <Field label="City">
        <Select placeholder="Select a city" defaultValue="">
          <option value="Skopje">Skopje</option>
        </Select>
      </Field>,
    );
    expect(screen.getByLabelText('City')).toHaveAttribute('data-placeholder', 'true');
  });

  it('stops marking itself a placeholder once a real value is chosen', async () => {
    render(
      <Field label="City">
        <Select placeholder="Select a city" defaultValue="Skopje">
          <option value="Skopje">Skopje</option>
          <option value="Bitola">Bitola</option>
        </Select>
      </Field>,
    );
    const select = screen.getByLabelText('City');
    expect(select).not.toHaveAttribute('data-placeholder');
    await userEvent.selectOptions(select, 'Bitola');
    expect((select as HTMLSelectElement).value).toBe('Bitola');
  });

  it('stays a native select, because the OS picker beats any custom one', () => {
    render(
      <Field label="Blood type">
        <Select>
          <option value="O-">O−</option>
        </Select>
      </Field>,
    );
    expect(screen.getByLabelText('Blood type').tagName).toBe('SELECT');
  });
});
