import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage as ChatMessageType, Note } from '../types';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { ConfirmDialog } from './ConfirmDialog';
import { COPY } from '../engine/copy';
import '../styles/ChatPanel.css';

interface ChatPanelProps {
  messages: ChatMessageType[];
  notes: Note[];
  onSubmit: (text: string) => void;
  onJumpToNote: (noteId: string) => void;
  onClear: () => void;
  onExamplePrompt: (text: string) => void;
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
  onClear,
  onExamplePrompt,
}: ChatPanelProps) => {
  const logRef = useRef<HTMLOListElement>(null);
  const clearButtonRef = useRef<HTMLButtonElement>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const hasNotes = notes.length > 0;
  const isEmpty = messages.length === 0;

  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

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

  return (
    <section
      id="chat-panel"
      role="tabpanel"
      aria-labelledby="tab-chat"
      className="chat"
    >
      <div className="chat__toolbar">
        {messages.length > 0 && (
          <button
            ref={clearButtonRef}
            type="button"
            className="btn btn--ghost chat__clear"
            onClick={() => setConfirmClearOpen(true)}
          >
            Clear chat
          </button>
        )}
      </div>

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
            className="chat__log"
            role="log"
            aria-relevant="additions"
            aria-label="Conversation"
          >
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                userQuery={priorUserByMessageId.get(message.id) ?? null}
                notes={notes}
                onJumpToNote={onJumpToNote}
              />
            ))}
          </ol>
        </>
      )}

      <ChatInput disabled={!hasNotes} onSubmit={onSubmit} />
      <ConfirmDialog
        open={confirmClearOpen}
        title="Clear chat transcript?"
        description="This cannot be undone."
        confirmLabel="Clear"
        cancelLabel="Keep"
        destructive
        onConfirm={() => {
          setConfirmClearOpen(false);
          onClear();
          requestAnimationFrame(() => clearButtonRef.current?.focus());
        }}
        onCancel={() => {
          setConfirmClearOpen(false);
          requestAnimationFrame(() => clearButtonRef.current?.focus());
        }}
      />
    </section>
  );
};
