/**
 * The two links on the detail screen that leave the app.
 *
 * Pure functions, apart from the rest of the screen, because these are the
 * part a test can actually hold down: whether a map opens is the browser's
 * business, but whether we hand it a well-formed destination is ours.
 */

export interface Destination {
  hospitalName: string;
  city: string;
  hospitalLat?: number | null;
  hospitalLng?: number | null;
}

const MAPS = 'https://www.google.com/maps/dir/?api=1&destination=';

/**
 * Where "Directions" goes.
 *
 * Google Maps rather than openstreetmap.org/directions, even though the map
 * on the screen is OSM tiles. This link has one job: hand a donor to the
 * navigation app already on their phone. Google's universal URL opens the
 * installed Maps app on Android and iOS and the web planner on a desktop;
 * the OSM directions page does none of that and is close to unusable on a
 * phone. The tiles are a picture, this is a handover.
 *
 * The pin wins when there is one — it is where the requester said the door
 * is. Without it the hospital name and city are better than nothing, and are
 * what somebody would have typed anyway.
 */
export function directionsUrl(to: Destination): string {
  const { hospitalLat: lat, hospitalLng: lng } = to;
  if (typeof lat === 'number' && typeof lng === 'number') {
    return `${MAPS}${encodeURIComponent(`${lat},${lng}`)}`;
  }
  return `${MAPS}${encodeURIComponent(`${to.hospitalName}, ${to.city}`)}`;
}

/**
 * A `tel:` href from a number a person typed.
 *
 * phoneSchema deliberately accepts spaces, brackets and dashes, because
 * over-strict validation loses real users. A dialler is less forgiving: hand
 * one "+389 (0)70 123-456" and some of them try to dial the punctuation. Only
 * digits and a single leading + survive.
 */
export function telHref(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
  return `tel:${digits}`;
}

/** Whether there is a number worth putting a button on. */
export function isDiallable(phone: string | undefined): phone is string {
  return typeof phone === 'string' && /\d/.test(phone);
}
