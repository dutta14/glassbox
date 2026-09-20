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

/* Time leads, because reaching back across years is the one question a
   general-purpose assistant cannot answer about your life. The others show
   the two remaining ways in: by tag and by topic. "How many notes do I have"
   was dropped; it asks the app about itself rather than asking the archive
   about its contents, which teaches the wrong first move. */
const EXAMPLE_PROMPTS = [
  'What did I write last week?',
  'Show me #work notes',
  'What did I write about postgres?',
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

  /* Years come from the notes themselves rather than a stored "since", so a
     library that is imported, pruned or restored always describes its real
     span. Undated notes would parse to NaN and poison the min/max, so they
     are dropped before comparing. */
  const archiveLine = useMemo(() => {
    const years = notes
      .map((note) => new Date(note.createdAt).getFullYear())
      .filter((year) => Number.isFinite(year));
    if (years.length === 0) return null;
    return COPY.archiveLine(notes.length, Math.min(...years), Math.max(...years));
  }, [notes]);
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
          <h2 className="chat__empty-title">{COPY.askTitle}</h2>
          {/* No second check for notes existing: an empty library yields no
              years, and archiveLine is already null in that case. */}
          {archiveLine && <p className="chat__empty-archive">{archiveLine}</p>}
          <p className="chat__empty-body">
            {hasNotes ? COPY.archiveContract : COPY.emptyNotesChat}
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
