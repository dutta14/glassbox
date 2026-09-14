import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatMessage } from './ChatMessage';
import type { Answer, ChatMessage as ChatMessageType, Note, ScoredChunk } from '../types';

/**
 * Gap #1 — deleted-cited-note path (edge case in the PM spec):
 * "Deleting a cited note: past messages keep their quoted text.
 *  'Jump to note' becomes disabled with tooltip 'This note was deleted.'"
 *
 * Behaviour is implemented in three places:
 *   - ChatMessage.tsx computes `noteExists` via notes.some(...)
 *   - QuotedSource renders the title as a disabled <span> when noteExists=false
 *   - The bottom "Open note" button is disabled when noteExists=false
 *
 * None of that is covered by the existing suite. These tests protect it.
 */

const iso = '2026-01-01T00:00:00.000Z';

const mkChunk = (noteId: string, noteTitle: string, text: string): ScoredChunk => ({
  noteId,
  noteTitle,
  position: 0,
  text,
  score: 0.42,
  matchedTerms: ['bread'],
  coverage: 0.75,
});

const mkAnswer = (source: ScoredChunk): Answer => ({
  text: source.text,
  sources: [source],
  trace: {
    intent: 'search',
    confidence: source.score,
    queryTerms: ['bread'],
    candidatesConsidered: 3,
    results: [source],
    reason: 'quoted the highest scoring passage',
  },
});

const mkAssistantMessage = (
  id: string,
  answer: Answer,
): ChatMessageType => ({
  id,
  role: 'assistant',
  text: answer.text,
  answer,
  createdAt: iso,
});

const mkNote = (id: string, title: string): Note => ({
  id,
  title,
  body: 'irrelevant to test',
  tags: [],
  createdAt: iso,
  updatedAt: iso,
});

describe('ChatMessage — deleted cited note behaviour', () => {
  it('renders the quoted passage text even when the cited note no longer exists in the current notes list', () => {
    const source = mkChunk(
      'note-gone',
      'Sourdough loaf',
      'Fold every 30 minutes for the first two hours.',
    );
    const message = mkAssistantMessage('m1', mkAnswer(source));
    // Notes list does NOT contain 'note-gone' — it was deleted.
    const { container } = render(
      <ul>
        <ChatMessage
          message={message}
          userQuery="how do I make bread"
          notes={[mkNote('other', 'Unrelated note')]}
          onJumpToNote={vi.fn()}
        />
      </ul>,
    );

    // Scope to the <blockquote> — the passage appears verbatim as the quote body,
    // and also once in the reasoning panel's candidate snippet; we want to
    // assert the quote body specifically.
    const quote = container.querySelector('blockquote');
    expect(quote).not.toBeNull();
    expect(quote!.textContent).toContain(
      'Fold every 30 minutes for the first two hours.',
    );
  });

  it('renders the source title as non-interactive text (no button) inside the quote footer when the cited note has been deleted', () => {
    const source = mkChunk('note-gone', 'Sourdough loaf', 'passage text');
    const message = mkAssistantMessage('m1', mkAnswer(source));
    const { container } = render(
      <ul>
        <ChatMessage
          message={message}
          userQuery="q"
          notes={[]}
          onJumpToNote={vi.fn()}
        />
      </ul>,
    );

    const quote = container.querySelector('blockquote');
    expect(quote).not.toBeNull();
    // Inside the quote footer there is NO button element at all — the deleted
    // note path renders the title as a <span aria-disabled="true">.
    expect(quote!.querySelector('button')).toBeNull();
    // The title text is still shown inside the quote.
    expect(quote!.textContent).toContain('Sourdough loaf');
    // And the aria-disabled marker is present, proving the "deleted" branch.
    const disabled = quote!.querySelector('[aria-disabled="true"]');
    expect(disabled).not.toBeNull();
    expect(disabled!.textContent).toBe('Sourdough loaf');
  });

  it('disables the bottom "Open note" button when the cited note has been deleted', () => {
    const source = mkChunk('note-gone', 'Sourdough loaf', 'passage text');
    const message = mkAssistantMessage('m1', mkAnswer(source));
    render(
      <ul>
        <ChatMessage
          message={message}
          userQuery="q"
          notes={[]}
          onJumpToNote={vi.fn()}
        />
      </ul>,
    );

    const openBtn = screen.getByRole('button', { name: 'Open note' });
    expect(openBtn).toBeDisabled();
  });

  it('does not invoke onJumpToNote when the disabled "Open note" button is clicked on a message citing a deleted note', async () => {
    const source = mkChunk('note-gone', 'Sourdough loaf', 'passage text');
    const message = mkAssistantMessage('m1', mkAnswer(source));
    const onJump = vi.fn();
    render(
      <ul>
        <ChatMessage
          message={message}
          userQuery="q"
          notes={[]}
          onJumpToNote={onJump}
        />
      </ul>,
    );

    const user = userEvent.setup();
    const openBtn = screen.getByRole('button', { name: 'Open note' });
    await user.click(openBtn);

    expect(onJump).not.toHaveBeenCalled();
  });

  it('renders the source title as an interactive button and calls onJumpToNote with the source noteId when the cited note still exists', async () => {
    const source = mkChunk('note-here', 'Sourdough loaf', 'passage text');
    const message = mkAssistantMessage('m1', mkAnswer(source));
    const onJump = vi.fn();
    render(
      <ul>
        <ChatMessage
          message={message}
          userQuery="q"
          notes={[mkNote('note-here', 'Sourdough loaf')]}
          onJumpToNote={onJump}
        />
      </ul>,
    );

    const user = userEvent.setup();
    const openBtn = screen.getByRole('button', { name: 'Open note' });
    expect(openBtn).not.toBeDisabled();
    await user.click(openBtn);

    expect(onJump).toHaveBeenCalledTimes(1);
    expect(onJump).toHaveBeenCalledWith('note-here');
  });
});
