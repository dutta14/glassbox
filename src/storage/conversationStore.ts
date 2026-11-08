import type {
  Answer,
  ChatMessage,
  Conversation,
  ScoredChunk,
  Trace,
} from "../types";
import type { ConversationStore, ConversationListResult } from "./types";

export const CHATS_DIR = "chats";
export const CONVERSATIONS_KEY = "glassbox.conversations.v1";

/* Named by id alone. The title is the user's first prompt and can contain
   anything they typed, so deriving a filename from it means sanitising text
   that is allowed to be arbitrary. The id is already filename safe. */
export const conversationFilename = (conversation: Conversation): string =>
  `${conversation.id}.json`;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const isScoredChunk = (value: unknown): value is ScoredChunk => {
  if (typeof value !== "object" || value === null) return false;
  const chunk = value as Record<string, unknown>;
  return (
    typeof chunk.noteId === "string" &&
    typeof chunk.noteTitle === "string" &&
    typeof chunk.position === "number" &&
    typeof chunk.text === "string" &&
    typeof chunk.score === "number" &&
    isStringArray(chunk.matchedTerms) &&
    typeof chunk.coverage === "number"
  );
};

const isTrace = (value: unknown): value is Trace => {
  if (typeof value !== "object" || value === null) return false;
  const trace = value as Record<string, unknown>;
  return (
    typeof trace.intent === "string" &&
    typeof trace.confidence === "number" &&
    isStringArray(trace.queryTerms) &&
    typeof trace.candidatesConsidered === "number" &&
    Array.isArray(trace.results) &&
    trace.results.every(isScoredChunk) &&
    typeof trace.reason === "string"
  );
};

const isAnswer = (value: unknown): value is Answer => {
  if (typeof value !== "object" || value === null) return false;
  const answer = value as Record<string, unknown>;
  return (
    typeof answer.text === "string" &&
    Array.isArray(answer.sources) &&
    answer.sources.every(isScoredChunk) &&
    isTrace(answer.trace)
  );
};

const isMessage = (value: unknown): value is ChatMessage => {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  if (typeof message.id !== "string") return false;
  if (message.role !== "user" && message.role !== "assistant") return false;
  if (typeof message.text !== "string") return false;
  if (typeof message.createdAt !== "string") return false;
  if (
    "answer" in message &&
    message.answer !== undefined &&
    !isAnswer(message.answer)
  )
    return false;
  return true;
};

const isConversation = (value: unknown): value is Conversation => {
  if (typeof value !== "object" || value === null) return false;
  const conversation = value as Record<string, unknown>;
  return (
    typeof conversation.id === "string" &&
    typeof conversation.title === "string" &&
    typeof conversation.createdAt === "string" &&
    typeof conversation.updatedAt === "string" &&
    Array.isArray(conversation.messages) &&
    conversation.messages.every(isMessage)
  );
};

const sortByUpdatedAtDesc = (conversations: Conversation[]): Conversation[] =>
  [...conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

export const createFolderConversationStore = (
  root: FileSystemDirectoryHandle,
): ConversationStore => {
  const filenamesById = new Map<string, string>();

  /* Resolved once and kept. Concurrent callers may each ask for it before the
     first resolves, which is harmless: getDirectoryHandle with create is
     idempotent. Caching the handle rather than the promise means a failure
     (permission revoked mid-session) is retried on the next call instead of
     being memoised forever. */
  let chatsDir: FileSystemDirectoryHandle | null = null;
  const dir = async (): Promise<FileSystemDirectoryHandle> => {
    if (chatsDir) return chatsDir;
    chatsDir = await root.getDirectoryHandle(CHATS_DIR, { create: true });
    return chatsDir;
  };

  const readFile = async (
    fileHandle: FileSystemFileHandle,
  ): Promise<{ conversation: Conversation; filename: string } | null> => {
    let file: File;
    try {
      file = await fileHandle.getFile();
    } catch {
      return null;
    }

    let text: string;
    try {
      text = await file.text();
    } catch {
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      return null;
    }

    if (!isConversation(parsed)) return null;
    return { conversation: parsed, filename: fileHandle.name };
  };

  const list = async (): Promise<ConversationListResult> => {
    const conversations: Conversation[] = [];
    let skipped = 0;
    const handle = await dir();

    for await (const entry of handle.values()) {
      if (entry.kind !== "file") continue;
      if (!entry.name.toLowerCase().endsWith(".json")) continue;

      const parsed = await readFile(entry);
      if (!parsed) {
        skipped++;
        continue;
      }

      // The name on disk, not the name we would generate. A file renamed by
      // hand still deletes correctly because this is what remove looks up.
      filenamesById.set(parsed.conversation.id, parsed.filename);
      conversations.push(parsed.conversation);
    }

    return { conversations: sortByUpdatedAtDesc(conversations), skipped };
  };

  const writeFile = async (name: string, contents: string): Promise<void> => {
    const fileHandle = await (
      await dir()
    ).getFileHandle(name, { create: true });
    const writable = await fileHandle.createWritable();
    try {
      await writable.write(contents);
    } finally {
      await writable.close();
    }
  };

  const put = async (conversation: Conversation): Promise<void> => {
    const name = conversationFilename(conversation);
    await writeFile(name, JSON.stringify(conversation, null, 2));
    filenamesById.set(conversation.id, name);
  };

  const remove = async (id: string): Promise<void> => {
    /* list() records the real filename for everything it read, so a file
       renamed by hand is still found. Anything else is at the name we would
       have written it under. */
    const name = filenamesById.get(id) ?? `${id}.json`;

    try {
      await (await dir()).removeEntry(name);
    } catch {
      // Unknown id or already deleted. Silent by contract.
    }
    filenamesById.delete(id);
  };

  return {
    kind: "folder",
    list,
    put,
    remove,
  };
};

export const createLocalConversationStore = (): ConversationStore => {
  const readAll = (): ConversationListResult => {
    try {
      const raw = localStorage.getItem(CONVERSATIONS_KEY);
      if (raw === null) return { conversations: [], skipped: 0 };
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return { conversations: [], skipped: 0 };
      const conversations = parsed.filter(isConversation);
      return {
        conversations: sortByUpdatedAtDesc(conversations),
        skipped: parsed.length - conversations.length,
      };
    } catch {
      return { conversations: [], skipped: 0 };
    }
  };

  const writeAll = (conversations: Conversation[]): void => {
    try {
      localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
    } catch {
      // Non-fatal. Chat continues in memory.
    }
  };

  return {
    kind: "local",
    list: async (): Promise<ConversationListResult> => readAll(),
    put: async (conversation: Conversation): Promise<void> => {
      const { conversations } = readAll();
      const idx = conversations.findIndex(
        (item) => item.id === conversation.id,
      );
      if (idx >= 0) conversations[idx] = conversation;
      else conversations.push(conversation);
      writeAll(conversations);
    },
    remove: async (id: string): Promise<void> => {
      const { conversations } = readAll();
      writeAll(conversations.filter((conversation) => conversation.id !== id));
    },
  };
};
