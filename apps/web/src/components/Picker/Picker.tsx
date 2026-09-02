import { useEffect, useId, useRef, useState } from 'react';
import { cx } from '../../lib/cx';
import { Icon, type IconName } from '../Icon/Icon';
import { useFieldContext } from '../Field/FieldContext';
import styles from './Picker.module.css';

interface PickerProps {
  /** The chosen option, or '' for none. */
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  /** Shown on the trigger while nothing is chosen. */
  placeholder: string;
  /** Sits inside the trigger, before the value. */
  icon?: IconName | undefined;
  className?: string | undefined;
}

/** Where the keyboard should land when the list opens. */
const firstIndex = (options: readonly string[], value: string) => {
  const found = options.indexOf(value);
  return found === -1 ? 0 : found;
};

/**
 * A list of options we draw ourselves.
 *
 * A native <select> would be the better answer and was the one here first —
 * §7.4 is right that the OS picker beats anything we could build on a phone.
 * But the popup a <select> opens is drawn by the browser, and on macOS it is a
 * system menu that follows the system's appearance: on a machine set to dark,
 * the list of cities came up black over this white form, and no CSS reaches
 * it. color-scheme does not help — that is a hint about the page, and the menu
 * is not part of the page.
 *
 * So this is the WAI-ARIA select-only combobox: the trigger keeps focus and
 * points at the active option with aria-activedescendant, which is what lets
 * the arrow keys, Home, End, Escape and type-ahead all behave the way they do
 * in the control this replaces.
 */
export function Picker({
  value,
  onChange,
  options,
  placeholder,
  icon,
  className,
}: PickerProps) {
  const field = useFieldContext();
  const listId = useId();
  const optionId = (index: number) => `${listId}-${String(index)}`;

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() => firstIndex(options, value));

  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  /* Type-ahead: the letters typed so far, and when they were. Cleared after a
     pause, so "bi" finds Bitola but a later "t" starts again at Tetovo. */
  const typed = useRef({ text: '', at: 0 });

  /* Keeps the active option in view while the arrows move down a list of
     thirty-five cities — without this the highlight walks off the bottom. */
  useEffect(() => {
    if (!open) return;
    list.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  /* A click anywhere else closes it. pointerdown rather than click: a mousedown
     on the page should dismiss before whatever it lands on reacts. */
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  function choose(index: number) {
    const chosen = options[index];
    if (chosen === undefined) return;
    onChange(chosen);
    setOpen(false);
    trigger.current?.focus();
  }

  function openAt(index: number) {
    setActive(index);
    setOpen(true);
  }

  /** Native select behaviour: letters jump to the next option that matches. */
  function typeAhead(key: string) {
    const now = Date.now();
    const text = (now - typed.current.at < 800 ? typed.current.text : '') + key;
    typed.current = { text, at: now };

    const from = open ? active : firstIndex(options, value);
    const found = options.findIndex(
      (option, index) =>
        /* Start after the current one, so pressing the same letter walks
         through the options that share it. */
        option.toLowerCase().startsWith(text) && (text.length > 1 || index !== from),
    );
    const match =
      text.length > 1 && options[from]?.toLowerCase().startsWith(text) ? from : found;
    if (match === -1) return;
    if (open) setActive(match);
    else openAt(match);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const last = options.length - 1;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) openAt(firstIndex(options, value));
        else setActive((index) => Math.min(last, index + 1));
        return;
      case 'ArrowUp':
        event.preventDefault();
        if (!open) openAt(firstIndex(options, value));
        else setActive((index) => Math.max(0, index - 1));
        return;
      case 'Home':
        if (!open) return;
        event.preventDefault();
        setActive(0);
        return;
      case 'End':
        if (!open) return;
        event.preventDefault();
        setActive(last);
        return;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (open) choose(active);
        else openAt(firstIndex(options, value));
        return;
      case 'Escape':
        if (!open) return;
        event.preventDefault();
        setOpen(false);
        return;
      case 'Tab':
        /* Not trapped: Tab moves on, and the list closes behind it. */
        setOpen(false);
        return;
      default:
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
          event.preventDefault();
          typeAhead(event.key.toLowerCase());
        }
    }
  }

  return (
    <div className={cx(styles.root, className)} ref={root}>
      <button
        type="button"
        ref={trigger}
        id={field?.controlId}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        aria-activedescendant={open ? optionId(active) : undefined}
        aria-describedby={field?.describedBy}
        aria-invalid={field?.invalid === true ? true : undefined}
        /* Only when it is true: aria-required="false" on every optional field
           is noise a screen reader reads out. */
        aria-required={field?.required === true ? true : undefined}
        className={styles.trigger}
        data-placeholder={value === '' || undefined}
        onClick={() => (open ? setOpen(false) : openAt(firstIndex(options, value)))}
        onKeyDown={onKeyDown}
      >
        {icon && <Icon name={icon} className={styles.icon} />}
        <span className={styles.value}>{value === '' ? placeholder : value}</span>
        <Icon
          name="chevronDown"
          className={cx(styles.chevron, open && styles.chevronUp)}
        />
      </button>

      {open && (
        <ul className={styles.list} id={listId} role="listbox" ref={list}>
          {options.map((option, index) => (
            /* Not a <button>: an option is not a control of its own, and a
               list of thirty-five buttons is thirty-five tab stops. The
               trigger keeps focus; this is what it points at. */
            <li
              key={option}
              id={optionId(index)}
              role="option"
              aria-selected={option === value}
              className={cx(
                styles.option,
                index === active && styles.optionActive,
                option === value && styles.optionChosen,
              )}
              /* pointerdown, not click: the document listener above closes on
                 pointerdown, and a click would arrive after it had gone. */
              onPointerDown={(event) => {
                event.preventDefault();
                choose(index);
              }}
              onPointerEnter={() => setActive(index)}
            >
              {option}
              {option === value && <Icon name="check" className={styles.tick} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
