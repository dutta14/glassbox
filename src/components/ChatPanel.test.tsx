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
  onSubmit?: (text: string) => void;
  onJumpToNote?: (noteId: string) => void;
  onExamplePrompt?: (text: string) => void;
  isFirstAssistantMessage?: (id: string) => boolean;
}

const renderChatPanel = ({
  messages,
  notes,
  onSubmit = vi.fn(),
  onJumpToNote = vi.fn(),
  onExamplePrompt = vi.fn(),
  isFirstAssistantMessage = () => false,
}: HarnessProps) =>
  render(
    <ChatPanel
      messages={messages}
      notes={notes}
      onSubmit={onSubmit}
      onJumpToNote={onJumpToNote}
      onExamplePrompt={onExamplePrompt}
      isFirstAssistantMessage={isFirstAssistantMessage}
    />,
  );

describe('ChatPanel — empty state', () => {
  it('renders the empty-state heading when there are no messages', () => {
    renderChatPanel({ messages: [], notes: [mkNote('n1', 'Postgres tuning')] });
    expect(
      screen.getByRole('heading', { name: 'Ask your notes anything' }),
    ).toBeInTheDocument();
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

/**
 * Clear chat is gone. Conversations are separate records now, so emptying a
 * transcript in place has no meaning: starting a new chat leaves the old one
 * intact in the rail, and deleting one removes it outright.
 *
 * This guards removal rather than absence of a class name. A button can be
 * visually hidden and still be reachable by keyboard and screen reader, which
 * is the failure this asserts against.
 */
describe('ChatPanel — Clear chat is removed', () => {
  const twoMessages = (): ChatMessageType[] => [
    mkUser('u1', 'What did I write about postgres?'),
    mkAssistant('a1', 'n1', 'Postgres tuning'),
  ];

  it('offers no Clear chat control once a conversation has messages', () => {
    renderChatPanel({
      messages: twoMessages(),
      notes: [mkNote('n1', 'Postgres tuning')],
    });

    expect(screen.queryByRole('button', { name: /clear/i })).toBeNull();
  });

  it('exposes no confirmation dialog to clear a transcript', () => {
    renderChatPanel({
      messages: twoMessages(),
      notes: [mkNote('n1', 'Postgres tuning')],
    });

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.body.textContent).not.toMatch(/clear chat/i);
  });

  it('renders no toolbar row above the conversation', () => {
    renderChatPanel({
      messages: twoMessages(),
      notes: [mkNote('n1', 'Postgres tuning')],
    });

    expect(document.querySelector('.chat__toolbar')).toBeNull();
  });
});

/**
 * The greeting and the composer now sit together in the middle of an empty
 * pane instead of the heading floating above an input pinned to the floor.
 *
 * The obvious way to build that is to nest the composer inside the empty
 * block, which would put it at a different position in the tree in each
 * branch. React reconciles by position, so the textarea would unmount and
 * remount the moment the first message landed, dropping the caret to <body>
 * mid-conversation. The layout is done with auto margins for that reason, and
 * these tests hold the DOM order still.
 */
describe('ChatPanel — welcome layout', () => {
  const panel = () => document.querySelector('.chat');

  it('marks the panel empty so the greeting and composer centre as one group', () => {
    renderChatPanel({ messages: [], notes: [mkNote('n1', 'Postgres tuning')] });

    expect(panel()).toHaveClass('chat--empty');
  });

  it('drops the empty marker once the conversation has a message', () => {
    renderChatPanel({
      messages: [mkUser('m1', 'how much shared_buffers?')],
      notes: [mkNote('n1', 'Postgres tuning')],
    });

    expect(panel()).not.toHaveClass('chat--empty');
  });

  it('keeps the composer a direct child of the panel in both states', () => {
    const notes = [mkNote('n1', 'Postgres tuning')];

    const { unmount } = renderChatPanel({ messages: [], notes });
    expect(document.querySelector('.chat > .composer')).not.toBeNull();
    unmount();

    renderChatPanel({ messages: [mkUser('m1', 'why?')], notes });
    expect(document.querySelector('.chat > .composer')).not.toBeNull();
  });

  it('leaves the caret in the composer when the first message arrives', async () => {
    const notes = [mkNote('n1', 'Postgres tuning')];
    const props = {
      notes,
      onSubmit: vi.fn(),
      onJumpToNote: vi.fn(),
      onExamplePrompt: vi.fn(),
      isFirstAssistantMessage: () => false,
    };

    const { rerender } = render(<ChatPanel messages={[]} {...props} />);

    const input = screen.getByRole('textbox', { name: /ask/i });
    input.focus();
    expect(document.activeElement).toBe(input);

    rerender(<ChatPanel messages={[mkUser('m1', 'why?')]} {...props} />);

    expect(document.activeElement).toBe(input);
    expect(input).toBeInTheDocument();
  });
});
