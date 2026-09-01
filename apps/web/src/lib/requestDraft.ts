import {
  BLOOD_TYPES,
  CITIES,
  URGENCIES,
  type BloodType,
  type Urgency,
} from '@kapka/shared';

export const REQUEST_DRAFT_KEY = 'kapka.request-draft';

/**
 * How long a half-filled request is worth keeping.
 *
 * A blood request is an emergency; a draft from last week is not one anybody
 * is coming back to finish. The expiry matters more than that, though — this
 * is a phone or a desk machine in a hospital, quite possibly shared, and the
 * draft holds a contact phone number and whatever someone typed in the note.
 * Keeping that until the browser is next cleared is not a thing to do quietly.
 */
export const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface RequestDraft {
  bloodType: BloodType | null;
  unitsNeeded: string;
  urgency: Urgency;
  hospitalName: string;
  city: string;
  contactPhone: string;
  note: string;
  pin: { lat: number; lng: number } | null;
}

export const EMPTY_DRAFT: RequestDraft = {
  bloodType: null,
  unitsNeeded: '1',
  urgency: 'urgent',
  hospitalName: '',
  city: '',
  contactPhone: '',
  note: '',
  pin: null,
};

/**
 * True when there is nothing a person would mind losing.
 *
 * The untouched form still has values in it — units defaults to 1, urgency to
 * urgent — so "has any field been set" is not the same question as "is this
 * object non-empty". Only the fields somebody has to actually fill in count.
 */
export function isEmptyDraft(draft: RequestDraft): boolean {
  return (
    draft.bloodType === null &&
    draft.hospitalName.trim() === '' &&
    draft.city === '' &&
    draft.contactPhone.trim() === '' &&
    draft.note.trim() === '' &&
    draft.pin === null
  );
}

const isString = (value: unknown): value is string => typeof value === 'string';

function coordinate(value: unknown): { lat: number; lng: number } | null {
  if (typeof value !== 'object' || value === null) return null;
  const { lat, lng } = value as { lat?: unknown; lng?: unknown };
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/**
 * Reads the stored draft, keeping only the fields that still make sense.
 *
 * Field by field rather than all-or-nothing: what is in storage was written by
 * whatever version of this app the person last loaded, and a form that throws
 * away a hospital name because a field it no longer has looks wrong is a form
 * that loses work for no reason. Anything unrecognised is simply dropped.
 *
 * Returns null when there is nothing usable — no draft, unreadable storage,
 * corrupt JSON, or a draft old enough to have expired.
 */
export function readDraft(now: number = Date.now()): RequestDraft | null {
  let raw: string | null = null;
  try {
    // A private window and blocked site data both throw here rather than
    // returning null.
    raw = localStorage.getItem(REQUEST_DRAFT_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Half-written by a tab that died mid-save, or edited by hand. Not worth
    // keeping, and definitely not worth throwing on.
    clearDraft();
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const stored = parsed as Record<string, unknown>;

  const savedAt = stored.savedAt;
  if (typeof savedAt !== 'number' || now - savedAt > DRAFT_MAX_AGE_MS) {
    clearDraft();
    return null;
  }

  const draft: RequestDraft = {
    bloodType: BLOOD_TYPES.includes(stored.bloodType as BloodType)
      ? (stored.bloodType as BloodType)
      : null,
    unitsNeeded: isString(stored.unitsNeeded)
      ? stored.unitsNeeded
      : EMPTY_DRAFT.unitsNeeded,
    urgency: URGENCIES.includes(stored.urgency as Urgency)
      ? (stored.urgency as Urgency)
      : EMPTY_DRAFT.urgency,
    hospitalName: isString(stored.hospitalName) ? stored.hospitalName : '',
    // A city that is no longer on the list cannot be submitted, so restoring
    // it would put the form in a state its own <select> cannot represent.
    city: CITIES.includes(stored.city as (typeof CITIES)[number])
      ? (stored.city as string)
      : '',
    contactPhone: isString(stored.contactPhone) ? stored.contactPhone : '',
    note: isString(stored.note) ? stored.note : '',
    pin: coordinate(stored.pin),
  };

  // Everything in it was junk. Restoring a blank form and announcing it as
  // recovered work would be a lie about what was kept.
  return isEmptyDraft(draft) ? null : draft;
}

/**
 * Writes the draft, or removes it when there is nothing left worth keeping.
 *
 * Called on every change rather than on a timer. A debounce would leave a
 * window in which the thing this exists to prevent still happens, and the
 * payload is well under a kilobyte — the write costs less than the render
 * that triggered it.
 */
export function writeDraft(draft: RequestDraft, now: number = Date.now()): void {
  if (isEmptyDraft(draft)) {
    clearDraft();
    return;
  }
  try {
    localStorage.setItem(REQUEST_DRAFT_KEY, JSON.stringify({ ...draft, savedAt: now }));
  } catch {
    /* Private window, blocked site data, or a full quota. The form still
       works; it just will not survive a reload, which is where it started. */
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(REQUEST_DRAFT_KEY);
  } catch {
    /* Nothing to do, and nothing worth failing a render over. */
  }
}
