import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NoteEditor } from './NoteEditor';
import type { Note } from '../types';

/**
 * A drop cap cannot be drawn on a textarea, so the note is read as prose and
 * typed into as a field. These pin the seam between the two.
 *
 * jsdom applies no styling here (vite.config sets css: false), so none of this
 * asserts appearance. It asserts the structure the appearance hangs off, and
 * the behaviour a reader would notice if the seam leaked.
 */

const LONG =
  'The starter doubles in about six hours at room temperature, which is the ' +
  'only measurement in the whole process I actually trust. Everything else ' +
  'is feel, and you learn the dough the way you learn a handwriting.';

const makeNote = (overrides: Partial<Note> = {}): Note => ({
  id: 'n1',
  title: 'Sourdough starter',
  body: LONG,
  tags: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const renderEditor = (note: Note = makeNote()) => {
  const onChangeBody = vi.fn();
  render(
    <NoteEditor
      note={note}
      scrollToOffset={null}
      previousNote={null}
      nextNote={null}
      onChangeTitle={vi.fn()}
      onChangeBody={onChangeBody}
      onScrollHandled={vi.fn()}
      onSelectNote={vi.fn()}
    />
  );
  return { onChangeBody };
};

const readView = (): HTMLElement | null =>
  document.querySelector('.editor__read');

describe('NoteEditor — reading and writing', () => {
  it('shows the note as prose before anyone starts writing', () => {
    renderEditor();
    expect(readView()).not.toBeNull();
    expect(readView()).toHaveTextContent('The starter doubles');
  });

  /**
   * The reading view is a second copy of text the field already exposes. Left
   * in the accessibility tree, a screen reader would read the whole note
   * twice.
   */
  it('hides the prose copy from assistive technology', () => {
    renderEditor();
    expect(readView()).toHaveAttribute('aria-hidden', 'true');
  });

  /**
   * The field is never unmounted, so the accessible name, the value and the
   * caret all stay in one place no matter which view is showing.
   */
  it('keeps the labelled field available while reading', () => {
    renderEditor();
    expect(screen.getByLabelText('Note body')).toHaveValue(LONG);
  });

  it('swaps the prose for the field once the field has focus', async () => {
    renderEditor();
    await userEvent.click(screen.getByLabelText('Note body'));
    expect(readView()).toBeNull();
  });

  it('returns to prose when the field loses focus', async () => {
    renderEditor();
    await userEvent.click(screen.getByLabelText('Note body'));
    expect(readView()).toBeNull();
    await userEvent.tab();
    expect(readView()).not.toBeNull();
  });

  it('still reports typing to the caller', async () => {
    const { onChangeBody } = renderEditor();
    await userEvent.type(screen.getByLabelText('Note body'), '!');
    expect(onChangeBody).toHaveBeenCalled();
  });
});

describe('NoteEditor — which notes get a drop cap', () => {
  it('sinks the capital three lines on prose long enough to hold it', () => {
    renderEditor();
    expect(readView()).toHaveAttribute('data-dropcap', '3');
  });

  /* The depth follows the length so the capital always lands on a line that
     has text on it. */
  it('sinks the capital only two lines on a two-line note', () => {
    renderEditor(makeNote({ body: LONG.slice(0, 120) }));
    expect(readView()).toHaveAttribute('data-dropcap', '2');
  });

  it('leaves a one-line note unmarked, so the capital cannot dangle', () => {
    renderEditor(makeNote({ body: 'Buy more flour.' }));
    expect(readView()).not.toHaveAttribute('data-dropcap');
  });

  it('leaves a note opening with a list dash unmarked', () => {
    renderEditor(makeNote({ body: `- ${LONG}` }));
    expect(readView()).not.toHaveAttribute('data-dropcap');
  });

  /* The empty state is placeholder text, not the note, and enlarging its first
     letter would drop-cap a prompt. */
  it('shows the placeholder unmarked when the note is empty', () => {
    renderEditor(makeNote({ body: '' }));
    expect(readView()).not.toHaveAttribute('data-dropcap');
    expect(readView()).toHaveTextContent(/./);
  });
});
