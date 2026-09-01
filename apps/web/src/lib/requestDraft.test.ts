import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearDraft,
  DRAFT_MAX_AGE_MS,
  EMPTY_DRAFT,
  isEmptyDraft,
  readDraft,
  REQUEST_DRAFT_KEY,
  writeDraft,
  type RequestDraft,
} from './requestDraft';

/**
 * What is in storage was written by whatever version of the app the person
 * last loaded, or by nothing at all, or by a tab that died halfway through the
 * write. None of that may throw on the way into a form.
 */

const FILLED: RequestDraft = {
  bloodType: 'O-',
  unitsNeeded: '3',
  urgency: 'critical',
  hospitalName: 'City General',
  city: 'Skopje',
  contactPhone: '+389 70 123 456',
  note: 'Ward 4, ask at reception',
  pin: { lat: 41.9981, lng: 21.4254 },
};

const store = (value: unknown) =>
  localStorage.setItem(REQUEST_DRAFT_KEY, JSON.stringify(value));

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('keeping a half-filled request', () => {
  it('reads back everything that was typed', () => {
    writeDraft(FILLED);
    expect(readDraft()).toEqual(FILLED);
  });

  it('has nothing to say when nothing was stored', () => {
    expect(readDraft()).toBeNull();
  });

  it('stores nothing for an untouched form', () => {
    // Units and urgency have values from the start. "Not empty as an object"
    // is not the same question as "has anyone typed anything".
    expect(isEmptyDraft(EMPTY_DRAFT)).toBe(true);
    writeDraft(EMPTY_DRAFT);
    expect(localStorage.getItem(REQUEST_DRAFT_KEY)).toBeNull();
  });

  it('forgets a draft that has been emptied again', () => {
    writeDraft(FILLED);
    writeDraft(EMPTY_DRAFT);
    expect(localStorage.getItem(REQUEST_DRAFT_KEY)).toBeNull();
  });

  it('clears on request', () => {
    writeDraft(FILLED);
    clearDraft();
    expect(readDraft()).toBeNull();
  });
});

describe('a draft that has been sitting there', () => {
  it('is dropped once it is a day old', () => {
    /* A blood request is an emergency; nobody comes back to yesterday's draft.
       It also holds a phone number, and this may be a shared machine. */
    const then = Date.now();
    writeDraft(FILLED, then);
    expect(readDraft(then + DRAFT_MAX_AGE_MS + 1)).toBeNull();
    expect(localStorage.getItem(REQUEST_DRAFT_KEY)).toBeNull();
  });

  it('is kept just inside the window', () => {
    const then = Date.now();
    writeDraft(FILLED, then);
    expect(readDraft(then + DRAFT_MAX_AGE_MS - 1)).toEqual(FILLED);
  });

  it('is dropped when it does not say when it was saved', () => {
    store({ ...FILLED });
    expect(readDraft()).toBeNull();
  });
});

describe('storage that cannot be trusted', () => {
  it('survives JSON that was never finished', () => {
    localStorage.setItem(REQUEST_DRAFT_KEY, '{"hospitalName":"City Gen');
    expect(readDraft()).toBeNull();
    // And takes it away, rather than failing on it again on every load.
    expect(localStorage.getItem(REQUEST_DRAFT_KEY)).toBeNull();
  });

  it('survives a stored value that is not an object at all', () => {
    localStorage.setItem(REQUEST_DRAFT_KEY, '"a string"');
    expect(readDraft()).toBeNull();
  });

  it('reads nothing rather than throwing when storage is blocked', () => {
    // A private window and blocked site data both throw here.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('access denied');
    });
    expect(() => readDraft()).not.toThrow();
    expect(readDraft()).toBeNull();
  });

  it('carries on rather than throwing when a write is refused', () => {
    // Out of quota, or site data blocked. The form still works — it just
    // stops surviving a reload, which is where it began.
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    expect(() => writeDraft(FILLED)).not.toThrow();
  });
});

describe('a draft from another version of the app', () => {
  it('drops a blood type that is not one of the eight', () => {
    store({ ...FILLED, bloodType: 'C+', savedAt: Date.now() });
    expect(readDraft()?.bloodType).toBeNull();
  });

  it('drops a city that is no longer on the list', () => {
    // Restoring it would put the form in a state its own select cannot show.
    store({ ...FILLED, city: 'Atlantis', savedAt: Date.now() });
    expect(readDraft()?.city).toBe('');
  });

  it('drops coordinates that are not coordinates', () => {
    store({ ...FILLED, pin: { lat: 'north', lng: 21 }, savedAt: Date.now() });
    expect(readDraft()?.pin).toBeNull();
  });

  it('drops coordinates that are off the planet', () => {
    store({ ...FILLED, pin: { lat: 91, lng: 21 }, savedAt: Date.now() });
    expect(readDraft()?.pin).toBeNull();
  });

  it('keeps the fields it does understand', () => {
    /* Field by field, not all or nothing: throwing away a hospital name
       because some other field looks wrong loses work for no reason. */
    store({ ...FILLED, bloodType: 'C+', urgency: 'whenever', savedAt: Date.now() });
    const draft = readDraft();
    expect(draft?.hospitalName).toBe('City General');
    expect(draft?.contactPhone).toBe('+389 70 123 456');
    expect(draft?.urgency).toBe('urgent');
  });

  it('says there is nothing rather than restoring a blank form', () => {
    // Announcing recovered work and then showing an empty form is a lie
    // about what was kept.
    store({ bloodType: 'C+', hospitalName: 42, savedAt: Date.now() });
    expect(readDraft()).toBeNull();
  });
});
