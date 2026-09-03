/**
 * What the API will accept as a profile picture (§9.5, §12).
 *
 * The rule here is that nothing the caller says about the file is believed.
 * Not its name, not its Content-Type, not its extension — only its bytes.
 * An upload endpoint that stores a declared type and serves it back is how a
 * file called avatar.png containing `<svg><script>` becomes stored XSS on
 * your own origin.
 */

/**
 * 512kB. The browser sends a 256px square thumbnail, which lands around
 * 20-40kB, so this is roomy — it is a backstop against a caller going
 * straight to the API, not the size anything is expected to be.
 */
export const AVATAR_MAX_BYTES = 512 * 1024;

/** The three formats every browser can both encode and display. */
export type AvatarType = 'image/jpeg' | 'image/png' | 'image/webp';

const startsWith = (bytes: Buffer, signature: number[], offset = 0): boolean =>
  bytes.length >= offset + signature.length &&
  signature.every((byte, index) => bytes[offset + index] === byte);

/**
 * The image's real type, from its magic bytes, or null if it is not one of
 * the three we accept.
 *
 * Deliberately not a library. These are three fixed byte signatures, and the
 * job is to say no to everything else — including SVG, which is a document
 * that can carry script, and is the reason "anything image/*" is not the rule.
 */
export function sniffImageType(bytes: Buffer): AvatarType | null {
  // JPEG: FF D8 FF
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }
  // WebP: "RIFF" then four bytes of length then "WEBP".
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return 'image/webp';
  }
  return null;
}
