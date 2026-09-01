import { useCallback, useRef, useState } from 'react';
import type { ZodType } from 'zod';

export type FieldErrors = Partial<Record<string, string>>;

export interface FieldErrorsApi {
  errors: FieldErrors;
  /**
   * Checks one field, on blur. Pass the just-changed value in `overrides` when
   * calling from a change handler — state has not caught up yet at that point.
   */
  check: (field: string, overrides?: Record<string, unknown>) => void;
  /**
   * Drops a message for a field being edited, without checking anything.
   *
   * Not validation: it removes a sentence that has stopped describing what is
   * on screen. Leaving "Enter a valid email address." under an address someone
   * is halfway through fixing is just nagging. The real check runs on blur.
   */
  clear: (field: string) => void;
  /** Every message, for a submit. Returns them as well as storing them. */
  checkAll: () => FieldErrors;
  /** The subset belonging to `fields`, for a form that validates in steps. */
  checkSome: (fields: readonly string[]) => FieldErrors;
  set: (next: FieldErrors) => void;
}

/**
 * Field-level validation against a whole Zod schema.
 *
 * The whole schema every time, never a picked-apart piece of it, because a
 * rule can span two fields — "that date is in the future" is a refinement over
 * the object — and it still has to land on the field it belongs to.
 *
 * `candidate` builds the object to validate from whatever the form currently
 * holds. It is called rather than passed as a value so it always reads the
 * render's own state instead of a stale copy.
 */
export function useFieldErrors(
  schema: ZodType,
  candidate: (overrides?: Record<string, unknown>) => unknown,
): FieldErrorsApi {
  const [errors, setErrors] = useState<FieldErrors>({});

  /*
   * Fields holding a message the schema did not produce — a rejection only
   * the server can make, like an address that already has an account.
   *
   * Blur must leave those alone. Re-running the schema over a perfectly
   * well-formed email finds nothing wrong and would delete the only sentence
   * explaining why the form will not submit; the end-to-end test at 390 found
   * exactly that, because moving focus to the new step's heading blurs the
   * input the server had just complained about. Editing the field is what
   * clears them, since editing is the only thing that can make them untrue.
   */
  const external = useRef<Set<string>>(new Set());

  /** First message per field: a stack of three under one input is noise, and
      fixing the first usually clears the rest. */
  const messages = useCallback(
    (overrides?: Record<string, unknown>): FieldErrors => {
      const parsed = schema.safeParse(candidate(overrides));
      if (parsed.success) return {};
      const found: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.map(String).join('.') || 'form';
        found[key] ??= issue.message;
      }
      return found;
    },
    [schema, candidate],
  );

  const check = useCallback(
    (field: string, overrides?: Record<string, unknown>) => {
      const message = messages(overrides)[field];
      if (message === undefined && external.current.has(field)) return;
      external.current.delete(field);
      setErrors((previous) => ({ ...previous, [field]: message }));
    },
    [messages],
  );

  const clear = useCallback((field: string) => {
    external.current.delete(field);
    setErrors((previous) =>
      previous[field] ? { ...previous, [field]: undefined } : previous,
    );
  }, []);

  const checkAll = useCallback(() => {
    const found = messages();
    // A submit re-derives everything, so nothing external survives it.
    external.current.clear();
    setErrors(found);
    return found;
  }, [messages]);

  const checkSome = useCallback(
    (fields: readonly string[]) => {
      const all = messages();
      const found: FieldErrors = {};
      for (const [key, message] of Object.entries(all)) {
        if (fields.includes(key) && message !== undefined) found[key] = message;
      }
      // The schema now has its own opinion about these, so they are its.
      for (const key of Object.keys(found)) external.current.delete(key);
      setErrors((previous) => ({ ...previous, ...found }));
      return found;
    },
    [messages],
  );

  /** Messages from outside the schema: whatever the API said. */
  const set = useCallback((next: FieldErrors) => {
    external.current = new Set(
      Object.entries(next)
        .filter(([, message]) => message !== undefined)
        .map(([key]) => key),
    );
    setErrors(next);
  }, []);

  return { errors, check, clear, checkAll, checkSome, set };
}
