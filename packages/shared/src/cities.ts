/**
 * The canonical city list (§3, a P0 decision).
 *
 * City matching is exact-string, so free-text entry silently breaks it —
 * "Bitola" vs "bitola " vs "Битола" all fail to match each other and the donor
 * simply never hears about the request. The UI offers a select, never an
 * input, and the API validates against this same list.
 *
 * Deliberately zod-free: the web app imports CITIES to populate a dropdown and
 * must not pull the whole validation library along with it. The matching Zod
 * schema is in schemas/enums.
 */
export const CITIES = [
  'Skopje',
  'Bitola',
  'Kumanovo',
  'Prilep',
  'Tetovo',
  'Veles',
  'Ohrid',
  'Gostivar',
  'Štip',
  'Strumica',
  'Kavadarci',
  'Kočani',
  'Kičevo',
  'Struga',
  'Radoviš',
  'Gevgelija',
  'Debar',
  'Kriva Palanka',
  'Sveti Nikole',
  'Negotino',
] as const;

export type City = (typeof CITIES)[number];
