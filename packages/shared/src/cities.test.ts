import { describe, expect, it } from 'vitest';
import { CITIES, normaliseCity } from './cities';

describe('the canonical list', () => {
  it('covers every city someone might register from', () => {
    // A donor whose city is missing never hears about a request, because
    // matching is an exact string on this value.
    expect(CITIES.length).toBeGreaterThanOrEqual(34);
  });

  it('has no duplicates and no stray whitespace', () => {
    expect(new Set(CITIES).size).toBe(CITIES.length);
    for (const city of CITIES) expect(city).toBe(city.trim());
  });

  it('resolves every canonical name to itself', () => {
    for (const city of CITIES) expect(normaliseCity(city)).toBe(city);
  });

  it('gives every city a distinct normalised form', () => {
    // Two cities folding to the same value would make one unreachable.
    const folded = CITIES.map((city) => normaliseCity(city));
    expect(new Set(folded).size).toBe(CITIES.length);
  });
});

describe('the three spellings §3 names as the failure case', () => {
  it.each(['Bitola', 'bitola ', 'Битола'])('resolves %o to Bitola', (input) => {
    expect(normaliseCity(input)).toBe('Bitola');
  });
});

describe('normalisation', () => {
  it('trims', () => {
    expect(normaliseCity('  Ohrid  ')).toBe('Ohrid');
  });

  it('ignores case', () => {
    expect(normaliseCity('SKOPJE')).toBe('Skopje');
    expect(normaliseCity('sKoPjE')).toBe('Skopje');
  });

  it('accepts Cyrillic, which is how the country writes', () => {
    // Rejecting this would mean refusing the spelling a Macedonian keyboard
    // produces.
    expect(normaliseCity('Скопје')).toBe('Skopje');
    expect(normaliseCity('Куманово')).toBe('Kumanovo');
    expect(normaliseCity('Крива Паланка')).toBe('Kriva Palanka');
    expect(normaliseCity('штип')).toBe('Štip');
  });

  it('accepts names typed without diacritics', () => {
    // Not every keyboard has š, č or ž.
    expect(normaliseCity('Stip')).toBe('Štip');
    expect(normaliseCity('Kocani')).toBe('Kočani');
    expect(normaliseCity('Kicevo')).toBe('Kičevo');
    expect(normaliseCity('Krusevo')).toBe('Kruševo');
    expect(normaliseCity('Radovis')).toBe('Radoviš');
  });

  it('handles the multi-letter Cyrillic characters', () => {
    // Ѓ, Љ, Њ, Џ, Ѕ and Ќ each transliterate to two Latin letters.
    expect(normaliseCity('Гевгелија')).toBe('Gevgelija');
    expect(normaliseCity('Делчево')).toBe('Delčevo');
  });

  it('resolves spellings, not inventions', () => {
    for (const input of ['Atlantis', 'Belgrade', 'Skopje City', '', '   ']) {
      expect(normaliseCity(input)).toBeNull();
    }
  });

  it('does not match a city by a prefix of its name', () => {
    // "Demir" is not "Demir Hisar" or "Demir Kapija", and guessing between
    // them would put a donor in the wrong place.
    expect(normaliseCity('Demir')).toBeNull();
    expect(normaliseCity('Demir Hisar')).toBe('Demir Hisar');
    expect(normaliseCity('Demir Kapija')).toBe('Demir Kapija');
  });
});
