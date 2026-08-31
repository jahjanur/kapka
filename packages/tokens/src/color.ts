/**
 * Colour maths for verifying the token layer.
 *
 * The tokens are authored in OKLCH because its lightness steps are
 * perceptually even (§6.2). Browsers render them in sRGB, and WCAG contrast is
 * defined on sRGB relative luminance — so checking a pairing means going all
 * the way through the conversion rather than trusting the L values.
 */

export interface Oklch {
  l: number;
  c: number;
  h: number;
  alpha: number;
}

/** Parses `oklch(0.62 0.145 155)` and `oklch(0.2 0.02 265 / 0.45)`. */
export function parseOklch(value: string): Oklch | null {
  const match = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)\s*)?\)/.exec(
    value,
  );
  if (!match) return null;
  return {
    l: Number(match[1]),
    c: Number(match[2]),
    h: Number(match[3]),
    alpha: match[4] === undefined ? 1 : Number(match[4]),
  };
}

/** OKLCH to gamma-encoded sRGB, each channel clamped to the 0–1 display range. */
export function oklchToSrgb({ l: L, c, h }: Oklch): [number, number, number] {
  const hRad = (h * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const lc = l_ ** 3;
  const mc = m_ ** 3;
  const sc = s_ ** 3;

  const linear = [
    4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc,
    -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc,
    -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc,
  ];

  return linear.map((channel) => {
    const encoded =
      channel <= 0.0031308
        ? 12.92 * channel
        : 1.055 * Math.abs(channel) ** (1 / 2.4) - 0.055;
    // Out-of-gamut colours are clipped by the display, so measure what is
    // actually shown rather than the theoretical value.
    return Math.min(1, Math.max(0, encoded));
  }) as [number, number, number];
}

/** WCAG relative luminance, from gamma-encoded sRGB. */
export function relativeLuminance([r, g, b]: [number, number, number]): number {
  const linearise = (channel: number) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
}

/** WCAG contrast ratio between two OKLCH colours: 1 (none) to 21 (max). */
export function contrastRatio(foreground: Oklch, background: Oklch): number {
  const lf = relativeLuminance(oklchToSrgb(foreground));
  const lb = relativeLuminance(oklchToSrgb(background));
  const [lighter, darker] = lf > lb ? [lf, lb] : [lb, lf];
  return (lighter + 0.05) / (darker + 0.05);
}
