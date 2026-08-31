/**
 * The canonical city list (§3, a P0 decision).
 *
 * Matching is exact-string on this value, so a donor whose city does not
 * appear here never hears about a request. The list therefore has to cover
 * every city someone might register from, not just the large ones.
 *
 * Deliberately zod-free so the web app can import CITIES to fill a dropdown
 * without pulling the whole validation library along. The schema is in
 * schemas/enums.
 */
export const CITIES = [
  'Skopje',
  'Bitola',
  'Kumanovo',
  'Prilep',
  'Tetovo',
  'Veles',
  'Štip',
  'Ohrid',
  'Gostivar',
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
  'Delčevo',
  'Vinica',
  'Resen',
  'Probištip',
  'Berovo',
  'Kruševo',
  'Makedonski Brod',
  'Demir Hisar',
  'Kratovo',
  'Valandovo',
  'Bogdanci',
  'Makedonska Kamenica',
  'Pehčevo',
  'Demir Kapija',
] as const;

export type City = (typeof CITIES)[number];

/**
 * Macedonian Cyrillic to Latin, per the official romanisation.
 *
 * The country writes in Cyrillic, so "Битола" is not an edge case — it is
 * what a Macedonian keyboard produces. §3 names it as the failure mode, and
 * rejecting it would mean the product does not accept its own users' spelling.
 */
const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  ѓ: 'gj',
  е: 'e',
  ж: 'ž',
  з: 'z',
  ѕ: 'dz',
  и: 'i',
  ј: 'j',
  к: 'k',
  л: 'l',
  љ: 'lj',
  м: 'm',
  н: 'n',
  њ: 'nj',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  ќ: 'kj',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'c',
  ч: 'č',
  џ: 'dž',
  ш: 'š',
};

function transliterate(value: string): string {
  // The `u` flag makes `.` match a whole code point, so this does not split
  // characters the way spreading a string into UTF-16 units would.
  return value.replace(/./gu, (character) => CYRILLIC_TO_LATIN[character] ?? character);
}

/**
 * Strips diacritics, so "Štip" and "Stip" compare equal — someone typing on a
 * keyboard without š should not be told their city does not exist.
 */
function fold(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

const comparable = (value: string) => fold(transliterate(value.trim().toLowerCase()));

/** Built once: every canonical name in its comparable form. */
const BY_COMPARABLE = new Map<string, City>(
  CITIES.map((city) => [comparable(city), city]),
);

/**
 * Resolves what someone typed to the canonical spelling, or null.
 *
 * §3 asks for normalisation at write time. Accepting "bitola ", "БИТОЛА" and
 * "Bitola" and storing all three as "Bitola" is what stops the exact-string
 * match in §5.1 from silently missing donors.
 */
export function normaliseCity(value: string): City | null {
  return BY_COMPARABLE.get(comparable(value)) ?? null;
}
