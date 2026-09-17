import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Answer, ChatMessage, Conversation } from '../types';
import type { ConversationStore } from '../storage/types';
import { createId } from '../storage/notes';

/**
 * Many chat threads instead of one perpetual transcript.
 *
 * The load-bearing idea is the draft. A conversation does not exist until it
 * has a message, so `activeId === null` while viewing the chat means the user
 * is in a draft that has no record anywhere. Without that, clicking "New chat"
 * would file an empty thread in the rail every time.
 *
 * Titles are the user's first prompt, verbatim. There is no model here to name
 * a thread, and inventing a summary would break the one promise the product
 * makes about where its words come from.
 */

const byNewestFirst = (a: Conversation, b: Conversation): number =>
  b.updatedAt.localeCompare(a.updatedAt);

export interface UseConversationsResult {
  conversations: Conversation[];
  /** null means a draft: the chat is open but nothing has been sent. */
  activeId: string | null;
  messages: ChatMessage[];
  startDraft: () => void;
  select: (id: string) => void;
  append: (text: string, answer: Answer) => void;
  remove: (id: string) => void;
  isFirstAssistantMessage: (id: string) => boolean;
  /** Records the store found but could not read. Drives the warning banner. */
  skippedCount: number;
}

export const useConversations = (
  store: ConversationStore | null
): UseConversationsResult => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [skippedCount, setSkippedCount] = useState(0);

  useEffect(() => {
    if (store === null) return;
    let cancelled = false;
    void store
      .list()
      .then(({ conversations: loaded, skipped }) => {
        if (cancelled) return;
        // Sorted here rather than trusted from the backend. Order is what the
        // rail shows, so it stays this hook's responsibility no matter which
        // store is behind it or what someone hand-edited on disk.
        setConversations([...loaded].sort(byNewestFirst));
        setSkippedCount(skipped);
      })
      .catch(() => {
        // A backend that cannot be read leaves the user in an empty draft
        // rather than a broken panel. Individual malformed records are already
        // dropped inside the store.
      });
    return () => {
      cancelled = true;
    };
  }, [store]);

  /* Switching folders swaps the store, and an id from the previous folder
     would point at a conversation that is no longer in the list. Drop back to
     a draft rather than showing a thread that cannot be loaded. */
  useEffect(() => {
    if (activeId !== null && !conversations.some((c) => c.id === activeId)) {
      setActiveId(null);
    }
  }, [conversations, activeId]);

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId]
  );

  const messages = active?.messages ?? [];

  /* A no-op when already in a draft. The composer owns its own text, so
     leaving this alone is what keeps a half-typed prompt from being thrown
     away when the user clicks "New chat" a second time. */
  /*
   * AC 13 expands the first assistant message of a *session*, once, so the
   * reasoning panel introduces itself to someone who has never seen it. It used
   * to be found by scanning the open transcript for its first answer, which was
   * the same thing back when a session held exactly one. With conversations it
   * is not: every thread has a first answer, so every thread reopened expanded
   * itself again, and a panel the user had already closed came back each visit.
   *
   * Two pieces, because one is not enough. The ref records that the session has
   * already spent its one expansion, so no later answer takes another. The
   * state records which message is expanded *right now*, and select() clears
   * it. Without that clearing, returning to the thread that produced the
   * message would expand it again, because the disclosure remounts and reads
   * this value afresh. The expansion belongs to the arrival of the answer, not
   * to the message for ever.
   *
   * startDraft deliberately does not clear. A draft renders no transcript, and
   * the only way back to the old thread is select(), which does clear. Adding
   * it there would be a line no test could kill.
   */
  const spentRef = useRef(false);
  const [autoExpandId, setAutoExpandId] = useState<string | null>(null);

  const startDraft = useCallback(() => {
    setActiveId(null);
  }, []);

  const select = useCallback((id: string) => {
    setActiveId(id);
    setAutoExpandId(null);
  }, []);

  /* Everything is computed before any setState. React invokes an updater
     twice under StrictMode, so generating an id or writing a file inside one
     would mint two ids and leave two files on disk for a single prompt. */
  const append = useCallback(
    (text: string, answer: Answer) => {
      const now = new Date().toISOString();
      const userMsg: ChatMessage = {
        id: createId(),
        role: 'user',
        text,
        createdAt: now,
      };
      const assistantMsg: ChatMessage = {
        id: createId(),
        role: 'assistant',
        text: answer.text,
        answer,
        createdAt: new Date().toISOString(),
      };
      if (!spentRef.current) {
        spentRef.current = true;
        setAutoExpandId(assistantMsg.id);
      }

      const existing = conversations.find((c) => c.id === activeId) ?? null;

      const updated: Conversation = existing
        ? {
            ...existing,
            messages: [...existing.messages, userMsg, assistantMsg],
            updatedAt: now,
          }
        : {
            id: createId(),
            // The first prompt names the thread. Stored rather than derived so
            // the name survives any later trimming of the transcript.
            title: text,
            messages: [userMsg, assistantMsg],
            createdAt: now,
            updatedAt: now,
          };

      setConversations((prev) =>
        [updated, ...prev.filter((c) => c.id !== updated.id)].sort(byNewestFirst)
      );
      if (!existing) setActiveId(updated.id);
      void store?.put(updated);
    },
    [activeId, conversations, store]
  );

  /* Deleting the thread being viewed moves to the next one down, then the
     previous, then back to a draft. Mirrors how deleting a note picks a
     neighbour, which exists so keyboard focus has somewhere to land instead of
     falling to <body>. */
  const remove = useCallback(
    (id: string) => {
      if (id === activeId) {
        const idx = conversations.findIndex((c) => c.id === id);
        const next =
          idx >= 0
            ? (conversations[idx + 1] ?? conversations[idx - 1] ?? null)
            : null;
        setActiveId(next?.id ?? null);
      }
      setConversations((prev) => prev.filter((c) => c.id !== id));
      void store?.remove(id);
    },
    [activeId, conversations, store]
  );

  const isFirstAssistantMessage = useCallback(
    (id: string): boolean => autoExpandId === id,
    [autoExpandId]
  );

  return {
    conversations,
    activeId,
    messages,
    startDraft,
    select,
    append,
    remove,
    isFirstAssistantMessage,
    skippedCount,
  };
};
