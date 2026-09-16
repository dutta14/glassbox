import type { Conversation } from "../types";
import { NoteRowMenu } from "./NoteRowMenu";
import { COPY } from "../engine/copy";
import "../styles/RailRow.css";

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
 * the user typed first and people repeat themselves. The row is styled exactly
 * like a note row and the row menu matches it too, so the two lists differ
 * only by the heading they sit under.
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
