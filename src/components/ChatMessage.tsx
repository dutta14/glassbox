import type { ChatMessage as ChatMessageType, Note } from '../types';
import { QuotedSource } from './QuotedSource';
import { ReasoningDisclosure } from './ReasoningDisclosure';
import '../styles/ChatMessage.css';

interface ChatMessageProps {
  message: ChatMessageType;
  userQuery: string | null;
  notes: Note[];
  onJumpToNote: (noteId: string) => void;
  defaultReasoningExpanded?: boolean;
}

export const ChatMessage = ({
  message,
  userQuery,
  notes,
  onJumpToNote,
  defaultReasoningExpanded = false,
}: ChatMessageProps) => {
  if (message.role === 'user') {
    return (
      <li className="msg msg--user">
        <div className="msg__bubble">{message.text}</div>
      </li>
    );
  }

  const answer = message.answer;
  const source = answer?.sources[0];
  const noteExists =
    source !== undefined && notes.some((n) => n.id === source.noteId);
  const updatedAt = source
    ? notes.find((n) => n.id === source.noteId)?.updatedAt
    : undefined;

  return (
    <li className="msg msg--assistant" data-msg-id={message.id}>
      {source ? (
        <QuotedSource
          source={source}
          updatedAt={updatedAt}
          noteExists={noteExists}
          onJumpToNote={() => onJumpToNote(source.noteId)}
        />
      ) : (
        <p className="msg__text">{message.text}</p>
      )}

      {source && (
        <div className="msg__actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => onJumpToNote(source.noteId)}
            disabled={!noteExists}
          >
            Open note
          </button>
        </div>
      )}

      {answer && (
        <ReasoningDisclosure
          answer={answer}
          userQuery={userQuery}
          onOpenCandidate={onJumpToNote}
          defaultExpanded={defaultReasoningExpanded}
        />
      )}
    </li>
  );
};
