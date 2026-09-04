import { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icon/Icon';
import { api, ApiError } from '../../lib/api';
import { AvatarError, toAvatarBlob } from '../../lib/avatarImage';
import styles from './AvatarPicker.module.css';

interface AvatarPickerProps {
  /** Shown while there is no picture, and behind one that is still loading. */
  initial: string;
  accessToken: string;
  /**
   * Puts the affordance on the picture rather than in a button beside it.
   *
   * The full form's outlined "Add a picture" button is as wide as a name, and
   * next to one in a header it pushed the name to an ellipsis at 320px.
   */
  compact?: boolean;
}

/**
 * The profile picture, and the controls to change it (§9.5).
 *
 * The picture is fetched as bytes and shown through an object URL, because
 * the endpoint takes a bearer token and an <img src> cannot send one. It is
 * private to the person in it — §12 keeps a donor's details off the public
 * feed, and a photograph identifies somebody more surely than a phone number.
 *
 * The initial stays underneath the whole time rather than being replaced by a
 * spinner: it is what this avatar looked like a moment ago and what it will
 * look like again if the picture is removed, so the shape on the page never
 * empties out.
 */
export function AvatarPicker({
  initial,
  accessToken,
  compact = false,
}: AvatarPickerProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  /* One object URL at a time, revoked when it is replaced or the screen goes.
     Left un-revoked, every change leaks the decoded image for the life of the
     document. */
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  const show = (blob: Blob | null) => {
    setUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return blob ? URL.createObjectURL(blob) : null;
    });
  };

  useEffect(() => {
    let live = true;
    void api
      .getAvatar(accessToken)
      .then((blob) => {
        if (live && blob) show(blob);
      })
      /* No picture is the ordinary state, and a failure to load one is not
         worth a message on a page about something else. */
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [accessToken]);

  async function choose(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      /* Resized and re-encoded before it leaves the device — which is also
         what drops the EXIF, and with it the GPS coordinates a phone writes
         into every photograph (§12). See lib/avatarImage.ts. */
      const image = await toAvatarBlob(file);
      await api.setAvatar(image, accessToken);
      show(image);
    } catch (caught) {
      setError(
        caught instanceof AvatarError || caught instanceof ApiError
          ? caught.message
          : 'That picture could not be saved. Try again.',
      );
    } finally {
      setBusy(false);
      /* Cleared so choosing the same file twice in a row still fires a change
         event — otherwise a failed upload cannot be retried with the same
         picture. */
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function remove() {
    setError(null);
    setBusy(true);
    try {
      await api.removeAvatar(accessToken);
      show(null);
    } catch {
      setError('That picture could not be removed. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (compact) {
    /* The affordance is on the picture, not beside it: a label wrapping the
       avatar, with a badge saying so. The separate outlined button it
       replaces was as wide as the name next to it and pushed it to an
       ellipsis at 320px. */
    return (
      <div className={styles.picker} data-compact="">
        <label className={styles.avatarLabel}>
          <span className={styles.avatar} data-busy={busy || undefined}>
            {url ? (
              <img className={styles.image} src={url} alt="" />
            ) : (
              <span aria-hidden="true">{initial}</span>
            )}
          </span>
          <span className={styles.badge} aria-hidden="true">
            <Icon name="user" />
          </span>
          <span className="visually-hidden">
            {url ? 'Change your picture' : 'Add a picture'}
          </span>
          <input
            ref={fileInput}
            type="file"
            className={styles.file}
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={(event) => void choose(event.target.files?.[0])}
          />
        </label>

        {url && (
          <button
            type="button"
            className={styles.removeBadge}
            onClick={() => void remove()}
            disabled={busy}
          >
            <Icon name="close" />
            <span className="visually-hidden">Remove your picture</span>
          </button>
        )}

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={styles.picker}>
      <span className={styles.avatar} data-busy={busy || undefined}>
        {url ? (
          /* Empty alt: the name is in the heading beside it, and "photo of
             Ana Petrovska" read out after "Ana Petrovska" is noise. */
          <img className={styles.image} src={url} alt="" />
        ) : (
          <span aria-hidden="true">{initial}</span>
        )}
      </span>

      <div className={styles.controls}>
        {/* A real file input, labelled — not a button that clicks a hidden
            one. The native control is the one that already works with a
            keyboard, a screen reader and a phone's camera. */}
        <label className={styles.action}>
          <Icon name="user" />
          {url ? 'Change picture' : 'Add a picture'}
          <input
            ref={fileInput}
            type="file"
            className={styles.file}
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={(event) => void choose(event.target.files?.[0])}
          />
        </label>

        {url && (
          <button
            type="button"
            className={styles.action}
            onClick={() => void remove()}
            disabled={busy}
          >
            <Icon name="close" />
            Remove
          </button>
        )}
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
