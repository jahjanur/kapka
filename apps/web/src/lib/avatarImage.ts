/**
 * Turning whatever somebody picked into a profile picture (§9.5, §12).
 *
 * The file is re-drawn onto a canvas at thumbnail size before it is uploaded,
 * and that does four jobs at once:
 *
 *  - Size. A phone camera produces four megabytes; this sends about thirty
 *    kilobytes, over whatever connection they are on (§11).
 *  - Shape. The avatar is a circle everywhere it appears, so the crop is
 *    decided here rather than by CSS hiding two thirds of a portrait.
 *  - Format. Whatever went in comes out as a JPEG, which is one of the three
 *    types the API will accept at all.
 *  - Metadata. This is the quiet one. A photograph off a phone carries EXIF,
 *    and EXIF routinely carries the GPS coordinates of where it was taken.
 *    Uploading the original would put a donor's home address in our database
 *    inside a field nobody thinks of as an address. Drawing to a canvas and
 *    re-encoding keeps the pixels and drops every tag with them.
 */

/** Both the stored size and twice the largest the avatar is ever drawn. */
export const AVATAR_SIZE = 256;

/** Room for a photograph, refused before it is ever decoded. */
export const AVATAR_SOURCE_MAX_BYTES = 12 * 1024 * 1024;

export class AvatarError extends Error {}

/**
 * A square JPEG of the middle of the picture.
 *
 * Rejects rather than returning null on failure: every failure here has a
 * sentence a person needs to read, and a null would have to be turned back
 * into one by the caller.
 */
export async function toAvatarBlob(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) {
    throw new AvatarError('Choose an image file.');
  }
  if (file.size > AVATAR_SOURCE_MAX_BYTES) {
    throw new AvatarError('That image is too large. Pick one under 12MB.');
  }

  const bitmap = await createImageBitmap(file).catch(() => {
    /* Anything the browser cannot decode: a renamed file, a corrupt one, or
       an SVG in a browser that refuses to bitmap it. The API would refuse it
       too — this is the same answer, one round trip earlier. */
    throw new AvatarError('That image could not be read. Try another one.');
  });

  try {
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const context = canvas.getContext('2d');
    if (!context) throw new AvatarError('That image could not be prepared.');

    /* Centre crop: take the largest square the picture contains and scale it
       down. Fitting the whole picture into a square instead would letterbox
       it inside a circle, which is worse than cropping. */
    const side = Math.min(bitmap.width, bitmap.height);
    context.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      AVATAR_SIZE,
      AVATAR_SIZE,
    );

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.85);
    });
    if (!blob) throw new AvatarError('That image could not be prepared.');
    return blob;
  } finally {
    // The bitmap holds decoded pixels — a 12MP photo is ~48MB of them.
    bitmap.close();
  }
}
