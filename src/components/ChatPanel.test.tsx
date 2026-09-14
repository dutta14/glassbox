import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatPanel } from './ChatPanel';
import type { Answer, ChatMessage as ChatMessageType, Note, ScoredChunk } from '../types';

/**
 * ChatPanel had zero coverage until now. Sasha's B3 (clear-chat dropping
 * focus to <body>) shipped precisely because of that gap. These tests
 * cover the load-bearing surface at the ChatPanel level.
 *
 * Focus-trap internals of ConfirmDialog are covered elsewhere; here we
 * assert the outcome after ChatPanel's onConfirm/onCancel handlers run.
 */

const iso = '2026-01-01T00:00:00.000Z';

const mkChunk = (noteId: string, title: string): ScoredChunk => ({
  noteId,
  noteTitle: title,
  position: 0,
  text: 'shared_buffers should be 25% of RAM.',
  score: 0.42,
  matchedTerms: ['postgres'],
  coverage: 0.75,
});

const mkAnswer = (noteId: string, title: string): Answer => {
  const s = mkChunk(noteId, title);
  return {
    text: s.text,
    sources: [s],
    trace: {
      intent: 'search',
      confidence: 0.42,
      queryTerms: ['postgres'],
      candidatesConsidered: 3,
      results: [s],
      reason: 'quoted the highest scoring passage',
    },
  };
};

const mkUser = (id: string, text: string): ChatMessageType => ({
  id,
  role: 'user',
  text,
  createdAt: iso,
});

const mkAssistant = (id: string, noteId: string, title: string): ChatMessageType => ({
  id,
  role: 'assistant',
  text: mkAnswer(noteId, title).text,
  answer: mkAnswer(noteId, title),
  createdAt: iso,
});

const mkNote = (id: string, title: string): Note => ({
  id,
  title,
  body: '',
  tags: [],
  createdAt: iso,
  updatedAt: iso,
});

interface HarnessProps {
  messages: ChatMessageType[];
  notes: Note[];
  onClear?: () => void;
  onSubmit?: (text: string) => void;
  onJumpToNote?: (noteId: string) => void;
  onExamplePrompt?: (text: string) => void;
  isFirstAssistantMessage?: (id: string) => boolean;
}

const renderChatPanel = ({
  messages,
  notes,
  onClear = vi.fn(),
  onSubmit = vi.fn(),
  onJumpToNote = vi.fn(),
  onExamplePrompt = vi.fn(),
  isFirstAssistantMessage = () => false,
}: HarnessProps) =>
  render(
    <ChatPanel
      messages={messages}
      notes={notes}
      onClear={onClear}
      onSubmit={onSubmit}
      onJumpToNote={onJumpToNote}
      onExamplePrompt={onExamplePrompt}
      isFirstAssistantMessage={isFirstAssistantMessage}
    />,
  );

describe('ChatPanel — empty state', () => {
  it('renders the empty-state heading and does not render the Clear chat button when there are no messages', () => {
    renderChatPanel({ messages: [], notes: [mkNote('n1', 'Postgres tuning')] });
    expect(
      screen.getByRole('heading', { name: 'Ask your notes anything' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear chat' })).toBeNull();
  });

  it('renders the three example prompt buttons when notes exist and there are no messages', () => {
    renderChatPanel({ messages: [], notes: [mkNote('n1', 'Postgres tuning')] });
    expect(
      screen.getByRole('button', { name: 'What did I write about postgres?' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Show me #work notes' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'How many notes do I have?' }),
    ).toBeInTheDocument();
  });

  it('calls onExamplePrompt with the example text when an example prompt button is clicked', async () => {
    const onExamplePrompt = vi.fn();
    renderChatPanel({
      messages: [],
      notes: [mkNote('n1', 'Postgres tuning')],
      onExamplePrompt,
    });
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: 'What did I write about postgres?' }),
    );
    expect(onExamplePrompt).toHaveBeenCalledTimes(1);
    expect(onExamplePrompt).toHaveBeenCalledWith('What did I write about postgres?');
  });
});

describe('ChatPanel — Clear chat gate', () => {
  const twoMessages = (): ChatMessageType[] => [
    mkUser('u1', 'What did I write about postgres?'),
    mkAssistant('a1', 'n1', 'Postgres tuning'),
  ];

  it('renders the Clear chat button when at least one message exists', () => {
    renderChatPanel({
      messages: twoMessages(),
      notes: [mkNote('n1', 'Postgres tuning')],
    });
    expect(screen.getByRole('button', { name: 'Clear chat' })).toBeInTheDocument();
  });

  it('opens the confirm alertdialog with the "Clear chat transcript?" title when the Clear chat button is clicked', async () => {
    renderChatPanel({
      messages: twoMessages(),
      notes: [mkNote('n1', 'Postgres tuning')],
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Clear chat' }));

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog.textContent).toContain('Clear chat transcript?');
  });

  it('calls onClear exactly once when the Clear button inside the confirm dialog is clicked', async () => {
    const onClear = vi.fn();
    renderChatPanel({
      messages: twoMessages(),
      notes: [mkNote('n1', 'Postgres tuning')],
      onClear,
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Clear chat' }));
    // Two buttons named "Clear" would be ambiguous; scope the confirm one via the alertdialog.
    const dialog = screen.getByRole('alertdialog');
    const confirm = Array.from(dialog.querySelectorAll('button')).find(
      (b) => b.textContent === 'Clear',
    );
    expect(confirm).toBeTruthy();
    await user.click(confirm!);

    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('moves keyboard focus to the composer textarea after confirming Clear chat, so focus does not fall to <body>', async () => {
    // This is the B3 regression guard. Before the fix, the Clear button
    // unmounted on onClear (messages went to zero) and the ref-based focus
    // call fell through to <body>.
    const onClear = vi.fn();
    renderChatPanel({
      messages: twoMessages(),
      notes: [mkNote('n1', 'Postgres tuning')],
      onClear,
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Clear chat' }));
    const dialog = screen.getByRole('alertdialog');
    const confirm = Array.from(dialog.querySelectorAll('button')).find(
      (b) => b.textContent === 'Clear',
    );
    await user.click(confirm!);

    // requestAnimationFrame is used to schedule the focus after commit.
    await new Promise((r) => requestAnimationFrame(() => r(null)));

    const composer = document.getElementById('composer-input');
    expect(composer).not.toBeNull();
    expect(document.activeElement).toBe(composer);
    // And explicitly NOT <body>, which was the shipped B3 symptom.
    expect(document.activeElement).not.toBe(document.body);
  });

  it('does not call onClear when the Keep button in the confirm dialog is clicked, and returns focus to the Clear chat button', async () => {
    const onClear = vi.fn();
    renderChatPanel({
      messages: twoMessages(),
      notes: [mkNote('n1', 'Postgres tuning')],
      onClear,
    });
    const user = userEvent.setup();
    const clearBtn = screen.getByRole('button', { name: 'Clear chat' });
    await user.click(clearBtn);

    const dialog = screen.getByRole('alertdialog');
    const keep = Array.from(dialog.querySelectorAll('button')).find(
      (b) => b.textContent === 'Keep',
    );
    expect(keep).toBeTruthy();
    await user.click(keep!);

    expect(onClear).not.toHaveBeenCalled();
    await new Promise((r) => requestAnimationFrame(() => r(null)));

    // Clear chat button is still present (messages are unchanged) and has focus.
    const clearAfter = screen.getByRole('button', { name: 'Clear chat' });
    expect(document.activeElement).toBe(clearAfter);
  });

  it('does not call onClear when Escape is pressed while the confirm alertdialog is open', async () => {
    const onClear = vi.fn();
    renderChatPanel({
      messages: twoMessages(),
      notes: [mkNote('n1', 'Postgres tuning')],
      onClear,
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Clear chat' }));

    await user.keyboard('{Escape}');

    expect(onClear).not.toHaveBeenCalled();
    // Dialog is dismissed.
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
