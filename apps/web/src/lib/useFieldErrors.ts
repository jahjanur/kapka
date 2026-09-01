import { useCallback, useState } from 'react';
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
      setErrors((previous) => ({ ...previous, [field]: message }));
    },
    [messages],
  );

  const clear = useCallback((field: string) => {
    setErrors((previous) =>
      previous[field] ? { ...previous, [field]: undefined } : previous,
    );
  }, []);

  const checkAll = useCallback(() => {
    const found = messages();
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
      setErrors((previous) => ({ ...previous, ...found }));
      return found;
    },
    [messages],
  );

  return { errors, check, clear, checkAll, checkSome, set: setErrors };
}
