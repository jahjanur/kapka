/**
 * The two brand shapes, as bare path strings on the sprite's 24x24 grid.
 *
 * The icon sprite holds them as React elements, which an illustration cannot
 * scale, transform or clip. These are the same drawings as one string each,
 * so a hero, a scene and a favicon are all the same droplet — the thing that
 * goes wrong otherwise is a second droplet, drawn by hand, one curve off.
 */

/** The droplet: Kapka's mark. */
export const DROP_PATH =
  'M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5S12.5 5.5 12 3c-.5 2.5-2 4.9-4 6.5S5 13 5 15a7 7 0 0 0 7 7Z';

/** The heart. */
export const HEART_PATH =
  'M20.8 5.6a5.5 5.5 0 0 0-7.8 0L12 6.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 22l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8Z';
