import { createContext, useContext } from 'react';

export interface FieldContextValue {
  /** id for the control, matching the label's htmlFor. */
  controlId: string;
  /** Space-separated ids of the help and error text, for aria-describedby. */
  describedBy: string | undefined;
  invalid: boolean;
  required: boolean;
}

export const FieldContext = createContext<FieldContextValue | null>(null);

/**
 * Controls read their wiring from the surrounding Field rather than being
 * handed a pile of aria props at every call site. Returns null when a control
 * is used standalone, in which case the caller supplies its own ids.
 */
export function useFieldContext(): FieldContextValue | null {
  return useContext(FieldContext);
}
