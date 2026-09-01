import { describe, expect, it } from 'vitest';
import { directionsUrl, isDiallable, telHref } from './directions';

const HOSPITAL = {
  hospitalName: 'City General Hospital 8th September',
  city: 'Skopje',
};

describe('the directions link', () => {
  it('uses the pin when the requester dropped one', () => {
    // It is where they said the door is, which a hospital name is not.
    const url = directionsUrl({
      ...HOSPITAL,
      hospitalLat: 41.9981,
      hospitalLng: 21.4254,
    });
    expect(url).toContain('destination=41.9981%2C21.4254');
  });

  it('falls back to the hospital and city when there is no pin', () => {
    const url = directionsUrl(HOSPITAL);
    expect(url).toContain('City%20General%20Hospital%208th%20September');
    expect(url).toContain('Skopje');
  });

  it('treats a half-set coordinate as no coordinate', () => {
    // One of the pair on its own points at the equator or the prime meridian.
    const url = directionsUrl({ ...HOSPITAL, hospitalLat: 41.9981, hospitalLng: null });
    expect(url).toContain('City%20General');
    expect(url).not.toContain('41.9981');
  });

  it('escapes a hospital name that would break the query string', () => {
    const url = directionsUrl({ hospitalName: 'Mother & Child "Annex"', city: 'Tetovo' });
    expect(url).not.toContain('&Child');
    expect(url).toContain('%26');
  });

  it('carries Cyrillic through as valid percent-encoding', () => {
    const url = directionsUrl({ hospitalName: 'Мајка Тереза', city: 'Скопје' });
    expect(() => new URL(url)).not.toThrow();
    expect(new URL(url).searchParams.get('destination')).toBe('Мајка Тереза, Скопје');
  });

  it('is a real URL whichever branch it took', () => {
    for (const to of [HOSPITAL, { ...HOSPITAL, hospitalLat: 41, hospitalLng: 21 }]) {
      expect(new URL(directionsUrl(to)).host).toBe('www.google.com');
    }
  });
});

describe('the call link', () => {
  it('strips what a dialler would try to dial', () => {
    // phoneSchema accepts these on purpose; a dialler is less forgiving.
    expect(telHref('+389 70 123 456')).toBe('tel:+38970123456');
    expect(telHref('(02) 3147-147')).toBe('tel:023147147');
  });

  it('keeps a leading + and drops any other', () => {
    expect(telHref('+389+70')).toBe('tel:+38970');
  });

  it('knows when there is no number worth a button', () => {
    expect(isDiallable(undefined)).toBe(false);
    expect(isDiallable('')).toBe(false);
    expect(isDiallable('   ')).toBe(false);
    expect(isDiallable('+389 70 123 456')).toBe(true);
  });
});
