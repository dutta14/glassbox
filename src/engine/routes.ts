/**
 * The one place an id becomes a URL path, so the encode-on-write half of the
 * routing contract lives in a single spot.
 *
 * Ids can contain a slash, a hash, or a space, any of which would otherwise
 * break the path structure or be read as a different segment, so every id is
 * percent-encoded on the way into a link. The decode-on-read half is handled by
 * react-router: useParams and useMatch hand back already-decoded params, so an
 * id round-trips out whole and nobody downstream has to decode it a second time
 * and risk double-decoding a literal percent sign.
 */

/** Percent-encoded id path so an id containing '/', '#' or a space survives the URL. */
export const notePath = (id: string): string =>
  `/note/${encodeURIComponent(id)}`;

/** Percent-encoded id path, on the same contract as notePath. */
export const bookPath = (id: string): string =>
  `/book/${encodeURIComponent(id)}`;

/** The note opened in the editor rather than read in the feed. The flag is a
    search param, so the path, and everything keyed on it, stays the note's. */
export const noteEditPath = (id: string): string => `${notePath(id)}?edit=1`;

/** Whether a location's query string asks for the editor. */
export const isEditSearch = (search: string): boolean =>
  new URLSearchParams(search).get("edit") === "1";
