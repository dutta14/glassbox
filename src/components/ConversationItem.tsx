import type { Conversation } from "../types";
import { NoteRowMenu } from "./NoteRowMenu";
import { COPY } from "../engine/copy";
import "../styles/ConversationItem.css";

interface ConversationItemProps {
  conversation: Conversation;
  isSelected: boolean;
  menuOpen: boolean;
  onSelect: () => void;
  onMenuOpenChange: (open: boolean) => void;
  onRequestDelete: () => void;
}

/**
 * Two conversations can carry the same title, because the title is whatever
 * the user typed first and people repeat themselves. The icon marks the row as
 * a chat without relying on colour, and the row menu matches the one on note
 * rows so deleting works the same way in both lists.
 */
export const ConversationItem = ({
  conversation,
  isSelected,
  menuOpen,
  onSelect,
  onMenuOpenChange,
  onRequestDelete,
}: ConversationItemProps) => {
  const title = conversation.title.trim() || COPY.untitledChat;

  return (
    <li className="note-row">
      <button
        type="button"
        className={`conversation-item${isSelected ? " conversation-item--selected" : ""}`}
        onClick={onSelect}
        aria-current={isSelected ? "true" : undefined}
        data-conversation-id={conversation.id}
      >
        <svg
          className="conversation-item__icon"
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M4 2.75h8A1.25 1.25 0 0 1 13.25 4v5A1.25 1.25 0 0 1 12 10.25H6.6L3.75 12.6V10.2A1.25 1.25 0 0 1 2.75 9V4A1.25 1.25 0 0 1 4 2.75Z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
        <span className="conversation-item__title">{title}</span>
      </button>
      <NoteRowMenu
        itemId={conversation.id}
        itemLabel={title}
        open={menuOpen}
        onOpenChange={onMenuOpenChange}
        onRequestDelete={onRequestDelete}
      />
    </li>
  );
};
