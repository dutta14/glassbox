import { useEffect, useMemo, useRef } from 'react';
import { useScrollFades } from '../hooks/useScrollFades';
import type { ChatMessage as ChatMessageType, Note } from '../types';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { COPY } from '../engine/copy';
import '../styles/ChatPanel.css';

interface ChatPanelProps {
  messages: ChatMessageType[];
  notes: Note[];
  onSubmit: (text: string) => void;
  onJumpToNote: (noteId: string) => void;
  onExamplePrompt: (text: string) => void;
  isFirstAssistantMessage: (id: string) => boolean;
}

const EXAMPLE_PROMPTS = [
  'What did I write about postgres?',
  'Show me #work notes',
  'How many notes do I have?',
];

export const ChatPanel = ({
  messages,
  notes,
  onSubmit,
  onJumpToNote,
  onExamplePrompt,
  isFirstAssistantMessage,
}: ChatPanelProps) => {
  const logRef = useRef<HTMLOListElement>(null);
  const hasNotes = notes.length > 0;
  const isEmpty = messages.length === 0;

  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  // Declared after the auto-scroll so its effect runs once the log has already
  // jumped to the bottom, otherwise it would measure the old position.
  useScrollFades(logRef, [messages.length]);

  const priorUserByMessageId = useMemo(() => {
    const map = new Map<string, string>();
    let lastUser: string | null = null;
    for (const m of messages) {
      if (m.role === 'user') {
        lastUser = m.text;
      } else if (lastUser !== null) {
        map.set(m.id, lastUser);
      }
    }
    return map;
  }, [messages]);

  const latestAssistantAnnouncement = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== 'assistant') continue;
      const source = m.answer?.sources[0];
      if (source) {
        const title = source.noteTitle.trim() || 'untitled note';
        return `Answer from ${title}. ${source.text}`;
      }
      return m.text;
    }
    return '';
  }, [messages]);

  return (
    <section
      id="chat-panel"
      aria-label="Chat"
      className={isEmpty ? 'chat chat--empty' : 'chat'}
    >
      {isEmpty ? (
        <div className="chat__empty">
          <h2 className="chat__empty-title">Ask your notes anything</h2>
          <p className="chat__empty-body">
            {hasNotes
              ? 'Every answer is a quote from something you wrote.'
              : COPY.emptyNotesChat}
          </p>
          {hasNotes && (
            <div className="chat__examples">
              {EXAMPLE_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="chat__example"
                  onClick={() => onExamplePrompt(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <h2 className="sr-only">Conversation</h2>
          <ol
            ref={logRef}
            className="chat__log scroll-fades"
            aria-label="Conversation"
          >
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                userQuery={priorUserByMessageId.get(message.id) ?? null}
                notes={notes}
                onJumpToNote={onJumpToNote}
                defaultReasoningExpanded={
                  message.role === 'assistant' &&
                  isFirstAssistantMessage(message.id)
                }
              />
            ))}
          </ol>
          <div className="sr-only" aria-live="polite" aria-atomic="true">
            {latestAssistantAnnouncement}
          </div>
        </>
      )}

      <ChatInput disabled={!hasNotes} onSubmit={onSubmit} />
    </section>
  );
};
