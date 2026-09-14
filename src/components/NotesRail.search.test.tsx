import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotesRail } from './NotesRail';
import type { Note } from '../types';

/**
 * The note filter is collapsed behind a glyph beside the new-note button.
 * Nothing covered NotesRail before this file, which is how a stale
 * `.notes-rail__new` selector in App.tsx survived a rename with a green build
 * and a green suite.
 */

const iso = '2026-01-01T00:00:00.000Z';

const mkNote = (id: string, title: string, body: string): Note => ({
  id,
  title,
  body,
  tags: [],
  createdAt: iso,
  updatedAt: iso,
});

const notes = [
  mkNote('n1', 'Postgres tuning', 'shared_buffers should be 25% of RAM'),
  mkNote('n2', 'Sourdough', 'the starter was underfed'),
];

const renderRail = () => {
  const onCreate = vi.fn();
  render(
    <NotesRail
      notes={notes}
      selectedNoteId={null}
      hasSampleNotes={false}
      folderState="unsupported"
      folderName={null}
      connectError={null}
      onSelect={vi.fn()}
      onCreate={onCreate}
      onDeleteSamples={vi.fn()}
      onConnectFolder={vi.fn()}
      onReconnectFolder={vi.fn()}
      onDisconnectFolder={vi.fn()}
      theme="dark"
      onToggleTheme={vi.fn()}
    />,
  );
  return { onCreate };
};

const filterToggle = () => screen.getByRole('button', { name: 'Filter notes' });
const filterField = () => screen.getByLabelText('Filter notes', { selector: 'input' });

describe('NotesRail filter', () => {
  it('keeps the filter field hidden until the glyph is used', () => {
    renderRail();

    expect(filterField()).not.toBeVisible();
    expect(filterToggle()).toHaveAttribute('aria-expanded', 'false');
  });

  it('reveals the filter field and moves focus into it', async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(filterToggle());

    expect(filterField()).toBeVisible();
    expect(filterField()).toHaveFocus();
    expect(filterToggle()).toHaveAttribute('aria-expanded', 'true');
  });

  it('narrows the note list to matches as the user types', async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(filterToggle());
    await user.type(filterField(), 'sourdough');

    expect(screen.getByText('Sourdough')).toBeInTheDocument();
    expect(screen.queryByText('Postgres tuning')).not.toBeInTheDocument();
  });

  /**
   * A collapsed field holding a live query would hide notes with nothing on
   * screen explaining the short list, so closing has to clear it.
   */
  it('restores the full list when the filter is closed with a query still in it', async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(filterToggle());
    await user.type(filterField(), 'sourdough');
    expect(screen.queryByText('Postgres tuning')).not.toBeInTheDocument();

    await user.click(filterToggle());

    expect(screen.getByText('Postgres tuning')).toBeInTheDocument();
    expect(screen.getByText('Sourdough')).toBeInTheDocument();
    expect(filterField()).toHaveValue('');
  });

  it('closes the filter on Escape and returns focus to the glyph', async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(filterToggle());
    await user.type(filterField(), 'postgres');
    await user.keyboard('{Escape}');

    expect(filterField()).not.toBeVisible();
    expect(filterToggle()).toHaveFocus();
    expect(screen.getByText('Sourdough')).toBeInTheDocument();
  });

  /**
   * A11y finding B4: aria-controls pointing at an element that is not in the
   * DOM is a 4.1.2 failure. The field is hidden rather than unmounted, so the
   * reference stays resolvable in both states.
   */
  it('points aria-controls at an element that exists while collapsed', () => {
    renderRail();

    const id = filterToggle().getAttribute('aria-controls');
    expect(id).not.toBeNull();
    expect(document.getElementById(id as string)).not.toBeNull();
  });

  it('still exposes the new-note button as a separate control', async () => {
    const user = userEvent.setup();
    const { onCreate } = renderRail();

    await user.click(screen.getByRole('button', { name: 'New note' }));

    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  /**
   * App.tsx reconciles focus after a delete by querying this class. Renaming
   * it without updating App.tsx drops focus to the body, which is the failure
   * mode a11y finding B3 described.
   */
  it('marks the new-note button with the class App.tsx uses to restore focus', () => {
    renderRail();

    const button = screen.getByRole('button', { name: 'New note' });
    expect(button).toHaveClass('notes-rail__action--new');
    expect(
      document.querySelectorAll('.notes-rail__action--new'),
    ).toHaveLength(1);
  });
});
