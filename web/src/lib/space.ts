/**
 * The spacing scale, as it exists in scale.css. Components take a step number,
 * never a raw length, so no component can invent a spacing value.
 */
export type SpaceStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12 | 16 | 20 | 24;

export const space = (step: SpaceStep): string => `var(--space-${step})`;
