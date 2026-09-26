import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { Conversation } from "../types";
import { COPY } from "../engine/copy";
import { ConversationItem } from "./ConversationItem";
import { ConfirmDialog } from "./ConfirmDialog";
import { DRAWER_SWAP_WIDTH } from "../hooks/useAskPane";
import "../styles/AskPane.css";

interface AskPaneProps {
  id: string;
  width: number;
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewQuestion: () => void;
  onDeleteConversation: (id: string) => void;
  onClose: () => void;
  /** The conversation itself, supplied by App so the panel keeps one instance. */
  children: React.ReactNode;
}

const ListIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d="M3 4.5h10M3 8h10M3 11.5h10" />
  </svg>
);

const PlusIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d="M8 3.5v9M3.5 8h9" />
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
);

const BackIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d="M12.5 8h-9M7 3.5L3.5 8 7 12.5" />
  </svg>
);

/**
 * Ask, beside the note rather than instead of it.
 *
 * This is a complementary region, not a dialog. The note stays readable and
 * editable while the pane is open, which is the point: the question is usually
 * about something in view. Announcing it as a dialog would tell a screen
 * reader user the rest of the page had become inert when it has not, and would
 * oblige a focus trap that would make moving between note and question
 * needlessly hard.
 *
 * Escape closes the pane and returns focus to the button that opened it, so
 * someone who opens Ask by keyboard is never stranded at the end of the
 * document with no way back.
 */
export const AskPane = ({
  id,
  width,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewQuestion,
  onDeleteConversation,
  onClose,
  children,
}: AskPaneProps) => {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Conversation | null>(null);
  const historyId = useId();
  const historyToggleRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<HTMLElement>(null);
  const hasOpenedRef = useRef(false);

  /* Below this the drawer stops sliding over the conversation and replaces it,
     because at the default width a drawer would leave only a sliver of what it
     covers, which reads as a broken swap rather than an overlay. */
  const swaps = width < DRAWER_SWAP_WIDTH;

  /* Escape closes the pane. The drawer does not eat it first: the drawer is a
     list you flick open and shut with the same glyph, while the pane is the
     thing someone wants gone when they reach for Escape. Making them press it
     twice to leave would be the common case paying for the rare one. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    const node = paneRef.current;
    node?.addEventListener("keydown", onKey as EventListener);
    return () => node?.removeEventListener("keydown", onKey as EventListener);
  }, [onClose]);

  /* Moving focus into the drawer when it opens, and back to the glyph when it
     shuts, so the list is reachable without hunting and the way out is where
     the way in was.

     This has to run after the commit rather than inside closeHistory, because
     the toggle is a different element in each state: open, it lives in the
     drawer; closed, it lives at the top of the body. Focusing eagerly would
     aim at the element that is about to unmount. */
  useEffect(() => {
    if (historyOpen) {
      hasOpenedRef.current = true;
      drawerRef.current?.querySelector<HTMLElement>("button, [href]")?.focus();
      return;
    }
    /* Only on the way back from open. Otherwise the pane would steal focus to
       the toggle the moment it mounted. */
    if (hasOpenedRef.current) historyToggleRef.current?.focus();
  }, [historyOpen]);

  const closeHistory = useCallback(() => setHistoryOpen(false), []);

  const pick = useCallback(
    (conversationId: string) => {
      onSelectConversation(conversationId);
      closeHistory();
    },
    [onSelectConversation, closeHistory],
  );

  const startNew = useCallback(() => {
    onNewQuestion();
    setHistoryOpen(false);
  }, [onNewQuestion]);

  /* The same control in both states, so the glyph that opens the list is the
     glyph that closes it. It moves rather than duplicating: in the body when
     the list is shut, inside the drawer once it is open, because a button that
     acts on the nav belongs with the nav rather than in the pane's title bar
     beside the controls that act on the conversation. */
  const historyToggle = (
    <button
      type="button"
      ref={historyToggleRef}
      className="ask-pane__glyph"
      onClick={() => setHistoryOpen((v) => !v)}
      aria-label={historyOpen ? COPY.askHistoryClose : COPY.askHistoryOpen}
      aria-expanded={historyOpen}
      aria-controls={historyId}
    >
      {historyOpen && swaps ? <BackIcon /> : <ListIcon />}
    </button>
  );

  return (
    <aside
      id={id}
      ref={paneRef}
      className="ask-pane"
      style={{ width: `${width}px` }}
      aria-label={COPY.askPaneRegion}
      data-drawer-swaps={swaps ? "true" : "false"}
    >
      <div className="ask-pane__header">
        <h2 className="ask-pane__title">{COPY.askPaneRegion}</h2>

        <button
          type="button"
          className="ask-pane__glyph"
          onClick={startNew}
          aria-label={COPY.askNewQuestion}
        >
          <PlusIcon />
        </button>

        <button
          type="button"
          className="ask-pane__glyph"
          onClick={onClose}
          aria-label={COPY.askClose}
          aria-expanded
          aria-controls={id}
        >
          <CloseIcon />
        </button>
      </div>

      <div className="ask-pane__body">
        {/* Out of the header and into the body, so the control sits with the
            list it reveals rather than with the conversation's own actions.
            Hidden once the drawer is open, where the drawer carries it. */}
        {!historyOpen && (
          <div className="ask-pane__body-top">{historyToggle}</div>
        )}

        {/* Kept mounted while the drawer is open rather than unmounted, so a
            half-typed question survives a glance at the history. Hidden from
            assistive tech when the drawer covers it, since a list of questions
            on top of a conversation should not read as one continuous region. */}
        <div
          className="ask-pane__conversation"
          aria-hidden={historyOpen && swaps}
        >
          {children}
        </div>

        {historyOpen && (
          <>
            {/* Dims only the pane, never the note. The note is not what the
                drawer is over, and dimming it would suggest the page behind
                had gone away. Not rendered in the swap case, where there is
                nothing left uncovered for it to dim. */}
            {!swaps && (
              <div
                className="ask-pane__scrim"
                onClick={closeHistory}
                aria-hidden="true"
              />
            )}

            <div
              id={historyId}
              ref={drawerRef}
              className="ask-pane__drawer"
              role="group"
              aria-label={COPY.askHistoryRegion}
            >
              <div className="ask-pane__drawer-top">{historyToggle}</div>

              <button
                type="button"
                className="ask-pane__drawer-new"
                onClick={startNew}
              >
                <PlusIcon />
                {COPY.askNewQuestion}
              </button>

              {conversations.length === 0 ? (
                <p className="ask-pane__drawer-empty">
                  {COPY.emptyChatsSidebar}
                </p>
              ) : (
                /* The same row the rail used, menu and all. Deleting a
                   question moved in here with the list rather than being lost
                   when the rail entry went, and a row that looks and behaves
                   like every other row in the app is one less thing to learn. */
                <ul className="ask-pane__drawer-list">
                  {conversations.map((conversation) => (
                    <ConversationItem
                      key={conversation.id}
                      conversation={conversation}
                      isSelected={conversation.id === activeConversationId}
                      menuOpen={menuOpenId === conversation.id}
                      onSelect={() => pick(conversation.id)}
                      onMenuOpenChange={(open) =>
                        setMenuOpenId(open ? conversation.id : null)
                      }
                      onRequestDelete={() => setPendingDelete(conversation)}
                    />
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete "${pendingDelete?.title.trim() || COPY.untitledChat}"?`}
        description="This deletes this conversation. Your notes stay unchanged."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={() => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (target !== null) onDeleteConversation(target.id);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </aside>
  );
};
