import { useEffect, useState } from "react";
import { isExternalAsset } from "../utils/noteImage";
import "../styles/NoteImage.css";

interface NoteImageProps {
  src: string;
  alt: string;
  readAsset: (path: string) => Promise<Blob | null>;
}

type Resolution =
  { state: "loading" } | { state: "ready"; url: string } | { state: "missing" };

/**
 * A picture stored beside the notes rather than on the web. The browser cannot
 * open a path on disk, so the bytes are read through the folder the user
 * granted and turned into an object URL for the life of this element.
 *
 * Hidden from assistive technology for the same reason the reading view is:
 * the field underneath holds the note's real text, including this image's own
 * Markdown, and a screen reader meeting both would be told about the picture
 * twice. The alt text is in that Markdown, so nothing is lost by not repeating
 * it here.
 */
export const NoteImage = ({ src, alt, readAsset }: NoteImageProps) => {
  const [resolved, setResolved] = useState<Resolution>({ state: "loading" });

  useEffect(() => {
    if (isExternalAsset(src)) {
      setResolved({ state: "ready", url: src });
      return;
    }

    let live = true;
    let objectUrl: string | null = null;
    setResolved({ state: "loading" });

    void (async () => {
      const blob = await readAsset(src);
      // Nothing is created after the element has gone, so there is no URL
      // left behind to leak when a reader moves through notes quickly.
      if (!live) return;
      if (!blob) {
        setResolved({ state: "missing" });
        return;
      }
      objectUrl = URL.createObjectURL(blob);
      setResolved({ state: "ready", url: objectUrl });
    })();

    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, readAsset]);

  /**
   * The note is shown without its Markdown source line, so a picture that
   * cannot be loaded would otherwise take the sketch's name away with it and
   * leave the note opening on a sentence about nothing. The name is kept.
   * This is the state a browser-storage library is always in: the images live
   * in the folder, so there is nothing to read until it is connected.
   */
  if (resolved.state === "missing") {
    return (
      <p className="note-image__missing" aria-hidden="true">
        {alt}
      </p>
    );
  }

  if (resolved.state === "loading") {
    return <div className="note-image__pending" aria-hidden="true" />;
  }

  return (
    <img
      className="note-image"
      src={resolved.url}
      alt=""
      aria-hidden="true"
      /* Async, so a large scan cannot hold up the first paint of the prose. */
      decoding="async"
    />
  );
};
