import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NoteEditor } from './NoteEditor';
import type { Note } from '../types';

/**
 * AC 1 — "New note" creates an empty note; NoteEditor auto-focuses the title
 * field when it mounts (or receives) a note whose title AND body are empty.
 *
 * This test targets NoteEditor's focus behaviour directly. The "New note"
 * button in the sidebar creates the empty note and switches to the editor,
 * which mounts NoteEditor with that empty note; the focus is done here.
 */

const iso = '2026-01-01T00:00:00.000Z';

const mkEmpty = (id: string): Note => ({
  id,
  title: '',
  body: '',
  tags: [],
  createdAt: iso,
  updatedAt: iso,
});

const mkFilled = (id: string): Note => ({
  id,
  title: 'Existing title',
  body: 'Existing body',
  tags: [],
  createdAt: iso,
  updatedAt: iso,
});

describe('NoteEditor — AC 1 focus behaviour for a freshly created note', () => {
  it('moves keyboard focus to the note title input when mounted with a note whose title and body are both empty', () => {
    render(
      <NoteEditor
        note={mkEmpty('n1')}
        scrollToOffset={null}
        onChangeTitle={vi.fn()}
        onChangeBody={vi.fn()}
        onDelete={vi.fn()}
        onScrollHandled={vi.fn()}
      />,
    );

    const titleInput = screen.getByLabelText('Note title');
    expect(document.activeElement).toBe(titleInput);
  });

  it('does not steal focus to the title input when mounted with a note that already has a title or body', () => {
    render(
      <NoteEditor
        note={mkFilled('n1')}
        scrollToOffset={null}
        onChangeTitle={vi.fn()}
        onChangeBody={vi.fn()}
        onDelete={vi.fn()}
        onScrollHandled={vi.fn()}
      />,
    );

    const titleInput = screen.getByLabelText('Note title');
    expect(document.activeElement).not.toBe(titleInput);
  });

  it('does not steal focus back to the title after the user has typed the title, on the same mounted note id', async () => {
    // Guards against a regression where the auto-focus effect re-fires on
    // every render and yanks focus off wherever the user is currently typing.
    const { rerender } = render(
      <NoteEditor
        note={mkEmpty('n1')}
        scrollToOffset={null}
        onChangeTitle={vi.fn()}
        onChangeBody={vi.fn()}
        onDelete={vi.fn()}
        onScrollHandled={vi.fn()}
      />,
    );

    // Now the note has a title. Simulate the parent re-rendering with the
    // updated note. Move focus off the title to prove the effect does not
    // pull it back.
    const bodyTextarea = screen.getByLabelText('Note body');
    bodyTextarea.focus();
    expect(document.activeElement).toBe(bodyTextarea);

    rerender(
      <NoteEditor
        note={{ ...mkEmpty('n1'), title: 'a' }}
        scrollToOffset={null}
        onChangeTitle={vi.fn()}
        onChangeBody={vi.fn()}
        onDelete={vi.fn()}
        onScrollHandled={vi.fn()}
      />,
    );

    // Focus should NOT have jumped to the title input.
    const titleInput = screen.getByLabelText('Note title');
    expect(document.activeElement).not.toBe(titleInput);
    expect(document.activeElement).toBe(bodyTextarea);
  });
});
