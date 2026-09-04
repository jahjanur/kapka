import styles from './MenuSignoff.module.css';

/**
 * The sign-off at the foot of the drawer.
 *
 * A supplied artwork, replacing the band that was drawn here. It carries its
 * own message as part of the picture — "Every donation can save a life. Thank
 * you for being part of Kapka." — so unlike the drawn decoration it is NOT
 * aria-hidden: the alt text is that sentence, or the message is simply lost to
 * anybody who cannot see it.
 *
 * Two things worth knowing about the trade, since everything else in this
 * product is drawn rather than shipped as a picture. The words are pixels now,
 * so they cannot be translated, selected, or resized with the page. And it is
 * a raster: served at 760px for a slot about 312 wide — twice over, for a
 * dense screen — rather than the 1686px it arrived at, which was 1.5MB for a
 * strip at the bottom of a menu.
 */
export function MenuSignoff() {
  return (
    <div className={styles.band}>
      <img
        className={styles.art}
        src="/img/menu-signoff.png"
        alt="Every donation can save a life. Thank you for being part of Kapka."
        /* Both given, so the space is held from the first layout pass and
           nothing below it moves when the file arrives. */
        width={760}
        height={420}
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}
