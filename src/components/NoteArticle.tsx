import { memo } from "react";
import { Link } from "react-router-dom";
import type { Book, Note } from "../types";
import { COPY } from "../engine/copy";
import { noteEditPath } from "../engine/routes";
import { CollectionLine } from "./CollectionLine";
import { Highlight } from "./Highlight";
import { NoteColophon } from "./NoteColophon";
import { NoteImage } from "./NoteImage";
import { useNoteReading } from "../hooks/useNoteReading";
import { ReadingView } from "./NoteReading";
import "../styles/NoteArticle.css";

interface NoteArticleProps {
  note: Note;
  /** The collection holding this note, if any. */
  book: Book | null;
  /** The search in progress, or empty. Every hit in title and body is marked. */
  query: string;
  readAsset: (path: string) => Promise<Blob | null>;
  /** Follows the collection line to that collection's page at this note. */
  onOpenCollection?: (bookId: string, noteId: string) => void;
}

/**
 * One post, read-only. It is the editor's reading view and nothing else: the
 * same title, collection line, ornament, prose and colophon, shared with the
 * editor so a post looks the same whether it is read or written. Memoised,
 * because the feed re-renders on every scroll-driven route change and a long
 * run of posts has no reason to follow it.
 *
 * Verse is laid out by CSS alone. The optical centring the editor measures is
 * left out on purpose, so a feed of poems never runs a measurement per post.
 */
export const NoteArticle = memo(
  ({ note, book, query, readAsset, onOpenCollection }: NoteArticleProps) => {
    const reading = useNoteReading(note);
    const titleId = `post-title-${note.id}`;
    const title = note.title.trim() || COPY.untitled;

    return (
      <article
        className="note-article"
        aria-labelledby={titleId}
        data-post-id={note.id}
      >
        <h3 id={titleId} className="editor__title note-article__title">
          <Highlight text={title} query={query} />
        </h3>
        {book && (
          <CollectionLine
            book={book}
            noteId={note.id}
            onOpen={onOpenCollection}
          />
        )}
        {/* Decorative only, so it is kept out of the accessibility tree. */}
        <div className="editor__ornament" aria-hidden="true">
          <span className="editor__ornament-mark" />
        </div>
        {reading.image && (
          <NoteImage
            src={reading.image.src}
            alt={reading.image.alt}
            readAsset={readAsset}
            announced
          />
        )}
        <div
          className={`editor__bodywrap${
            reading.verse ? " editor__bodywrap--verse" : ""
          }`}
        >
          <ReadingView reading={reading} query={query} />
        </div>
        <NoteColophon
          note={note}
          action={
            <Link
              className="note-article__edit"
              to={noteEditPath(note.id)}
              aria-label={`${COPY.feedEdit} ${title}`}
            >
              {COPY.feedEdit}
            </Link>
          }
        />
      </article>
    );
  },
);
NoteArticle.displayName = "NoteArticle";
