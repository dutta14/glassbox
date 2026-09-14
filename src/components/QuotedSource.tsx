import type { ScoredChunk } from '../types';
import '../styles/QuotedSource.css';

interface QuotedSourceProps {
  source: ScoredChunk;
  updatedAt?: string;
  noteExists: boolean;
  onJumpToNote: () => void;
}

const formatDate = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export const QuotedSource = ({
  source,
  updatedAt,
  noteExists,
  onJumpToNote,
}: QuotedSourceProps) => {
  const rawTitle = source.noteTitle.trim();
  const isUntitled = rawTitle.length === 0;
  const title = rawTitle || 'Untitled note';
  const dateLabel = formatDate(updatedAt);
  const jumpLabel = isUntitled
    ? `Jump to untitled note: ${source.text.slice(0, 60)}`
    : `Jump to note ${title}`;

  return (
    <blockquote className="quote">
      <p className="quote__body">{source.text}</p>
      <footer className="quote__source">
        <span className="quote__source-label">from</span>{' '}
        {noteExists ? (
          <button
            type="button"
            className="quote__source-link"
            onClick={onJumpToNote}
            aria-label={jumpLabel}
          >
            {title}
          </button>
        ) : (
          <span
            className="quote__source-link quote__source-link--disabled"
            aria-disabled="true"
            title="This note was deleted."
          >
            {title}
          </span>
        )}
        {dateLabel && (
          <>
            <span className="quote__source-sep" aria-hidden="true"> · </span>
            <span className="quote__source-date">{dateLabel}</span>
          </>
        )}
      </footer>
    </blockquote>
  );
};
