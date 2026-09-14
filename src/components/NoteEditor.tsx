import { useLayoutEffect, useRef, useState } from 'react';
import type { Note } from '../types';
import { COPY } from '../engine/copy';
import { ConfirmDialog } from './ConfirmDialog';
import '../styles/NoteEditor.css';

interface NoteEditorProps {
  note: Note;
  scrollToOffset: number | null;
  onChangeTitle: (title: string) => void;
  onChangeBody: (body: string) => void;
  onDelete: () => void;
  onScrollHandled: () => void;
}

const formatEdited = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = Date.now();
  const diff = Math.max(0, now - d.getTime());
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export const NoteEditor = ({
  note,
  scrollToOffset,
  onChangeTitle,
  onChangeBody,
  onDelete,
  onScrollHandled,
}: NoteEditorProps) => {
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const wasEmptyOnMountRef = useRef<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useLayoutEffect(() => {
    if (note.title === '' && note.body === '' && wasEmptyOnMountRef.current !== note.id) {
      wasEmptyOnMountRef.current = note.id;
      titleRef.current?.focus();
    }
  }, [note.id, note.title, note.body]);

  useLayoutEffect(() => {
    if (scrollToOffset === null) return;
    const el = bodyRef.current;
    if (!el) return;
    el.focus();
    const clamped = Math.min(Math.max(0, scrollToOffset), note.body.length);
    el.setSelectionRange(clamped, clamped);
    const lineHeight = 24;
    const linesBefore = note.body.slice(0, clamped).split('\n').length;
    el.scrollTop = Math.max(0, (linesBefore - 3) * lineHeight);
    onScrollHandled();
  }, [scrollToOffset, note.body, onScrollHandled]);

  const displayTitle = note.title.trim() || COPY.untitled;

  const handleConfirmDelete = () => {
    setConfirmOpen(false);
    onDelete();
  };

  const handleCancelDelete = () => {
    setConfirmOpen(false);
    requestAnimationFrame(() => deleteButtonRef.current?.focus());
  };

  return (
    <section
      id="editor-panel"
      role="tabpanel"
      aria-labelledby="tab-editor"
      className="editor"
    >
      <div className="editor__inner">
        <input
          ref={titleRef}
          className="editor__title"
          aria-label="Note title"
          placeholder={COPY.placeholderTitle}
          value={note.title}
          onChange={(e) => onChangeTitle(e.target.value)}
        />
        {note.tags.length > 0 && (
          <div className="editor__tags" role="group" aria-label="Tags">
            {note.tags.map((tag) => (
              <span key={tag} className="tag">
                #{tag}
              </span>
            ))}
          </div>
        )}
        <textarea
          ref={bodyRef}
          className="editor__body"
          aria-label="Note body"
          placeholder={COPY.placeholderBody}
          value={note.body}
          onChange={(e) => onChangeBody(e.target.value)}
        />
        <footer className="editor__meta">
          <span className="editor__edited">
            Edited <time dateTime={note.updatedAt}>{formatEdited(note.updatedAt)}</time>
          </span>
          <button
            ref={deleteButtonRef}
            type="button"
            className="editor__delete"
            onClick={() => setConfirmOpen(true)}
          >
            Delete
          </button>
        </footer>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title={`Delete "${displayTitle}"?`}
        description="This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
    </section>
  );
};
