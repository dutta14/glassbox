import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Note, NoteFormat } from "../types";
import type { NotesStore } from "../storage/types";
import { hasSeeded, markSeeded, newNote, parseTags } from "../storage/notes";
import { sampleNotes } from "../data/sampleNotes";

const AUTOSAVE_MS = 500;

/**
 * Tags that describe where a note came from, not something the user wrote in
 * the body. These are preserved across edits so a user typing into a sample
 * note does not silently strip its provenance.
 *
 * `ai-generated` is here because it is load-bearing rather than descriptive:
 * it is what keeps writing the user did not write out of every answer. Losing
 * it does not show up as a missing label, it shows up months later as a poem
 * a machine wrote being quoted back as theirs.
 */
const PROVENANCE_TAGS: ReadonlySet<string> = new Set([
  "sample",
  "ai-generated",
]);

const extractTagsFromBody = (body: string): string[] => {
  const matches = body.match(/#[a-z0-9][a-z0-9-]*/gi) ?? [];
  return parseTags(matches.join(" "));
};

/**
 * The tags a note should carry after its body was edited.
 *
 * Tags are written as hashtags in the body, so the body is their source. But
 * it is not their only source: notes brought in from elsewhere carry tags in
 * their front matter with no hashtag anywhere in the text. Rebuilding the list
 * from the body alone deleted every one of those on the first keystroke, which
 * silently cost a note its subject, its series, and its exclusion from search.
 *
 * So the previous body is consulted too. A tag the old body produced and the
 * new one does not was deliberately removed by deleting its hashtag, and goes.
 * A tag the body never produced was set some other way and stays.
 */
const mergeTags = (
  previous: string[],
  previousBody: string,
  nextBody: string,
): string[] => {
  const fromOldBody = new Set(extractTagsFromBody(previousBody));
  const merged = [...extractTagsFromBody(nextBody)];
  for (const tag of previous) {
    const managedByBody = fromOldBody.has(tag) && !PROVENANCE_TAGS.has(tag);
    if (!managedByBody && !merged.includes(tag)) merged.push(tag);
  }
  return merged;
};

/**
 * The library in the order it was written, newest first.
 *
 * Ordered on createdAt, not updatedAt. Sorting on updatedAt makes the list
 * restless: fixing one tag on a poem from 2011 rewrites its updatedAt and
 * throws it to the top, above everything written since. In a working set of a
 * dozen notes that reads as "what I touched last". In a library of several
 * hundred archived pieces it reads as the archive rearranging itself every
 * time you correct a typo, and the reader loses the place they were in.
 *
 * createdAt is the date the piece was written and never changes, so the
 * shelf stays in the same order you left it. This also matches the order
 * Previous and Next already move through, in useNoteNeighbours.
 */
/**
 * Fold a batch of freshly read notes into what is already on screen.
 *
 * Batches arrive in directory order and two files can claim one id, so this
 * applies the same newest-wins rule the store uses rather than appending
 * blindly. It is deliberately additive: a batch says what exists, never what
 * is gone, so nothing is removed here. Deletions are settled by the resolved
 * list that replaces this one a moment later.
 */
const mergeBatch = (prev: Note[], batch: Note[]): Note[] => {
  const byId = new Map(prev.map((n) => [n.id, n]));
  for (const note of batch) {
    const existing = byId.get(note.id);
    if (!existing || note.updatedAt > existing.updatedAt)
      byId.set(note.id, note);
  }
  return sortByCreated([...byId.values()]);
};

const sortByCreated = (notes: Note[]): Note[] =>
  [...notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export type NotesStatus = "loading" | "ready" | "error";

export interface ExternalConflict {
  id: string;
  title: string;
}

export interface UseNotesResult {
  notes: Note[];
  status: NotesStatus;
  error: string | null;
  storeLabel: string;
  storeKind: NotesStore["kind"];
  createNote: (format?: NoteFormat) => Note;
  updateNote: (id: string, patch: { title?: string; body?: string }) => void;
  /** Prose is stored as the absence of the key, which a patch cannot express. */
  setNoteFormat: (id: string, format: NoteFormat) => void;
  deleteNote: (id: string) => void;
  hasSampleNotes: boolean;
  deleteSampleNotes: () => void;
  /**
   * Read a file a note points at, such as an image. Resolves to null on any
   * backend that has no folder to look in, so callers must handle absence as
   * a normal outcome rather than an error.
   */
  readAsset: (path: string) => Promise<Blob | null>;
  /** Notes whose on-disk copy changed while a local edit was in flight. */
  externalConflicts: ExternalConflict[];
  dismissConflict: (id: string) => void;
}

/**
 * Per-note write coordinator. Debounces edits per note and serialises writes
 * so a second write cannot start while the first is still in flight. This
 * matters for the folder store, where an overlapping write can truncate a
 * file; it is harmless but consistent for the localStorage store.
 */
interface NoteWriteState {
  timer: number | null;
  pending: Note | null;
  running: Promise<void> | null;
}

export const useNotes = (store: NotesStore): UseNotesResult => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [status, setStatus] = useState<NotesStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [externalConflicts, setExternalConflicts] = useState<
    ExternalConflict[]
  >([]);

  const writeStates = useRef<Map<string, NoteWriteState>>(new Map());
  const pendingDeletions = useRef<Set<string>>(new Set());
  const storeRef = useRef(store);
  storeRef.current = store;
  const notesRef = useRef<Note[]>(notes);
  notesRef.current = notes;

  /* Reads through the ref rather than closing over the store, so the identity
     is stable for the whole session. An effect that fetches an image depends
     on this: a new function on every render would revoke and refetch the same
     picture on every keystroke in the note it sits in. */
  const readAsset = useCallback(
    (path: string): Promise<Blob | null> =>
      storeRef.current.readAsset?.(path) ?? Promise.resolve(null),
    [],
  );

  const isDirty = useCallback((id: string): boolean => {
    const state = writeStates.current.get(id);
    if (!state) return false;
    return (
      state.pending !== null || state.running !== null || state.timer !== null
    );
  }, []);

  const flushNote = useCallback(async (id: string): Promise<void> => {
    const state = writeStates.current.get(id);
    if (!state) return;
    if (state.running) {
      await state.running;
    }
    while (state.pending) {
      const note = state.pending;
      state.pending = null;
      state.running = storeRef.current.put(note).catch((err) => {
        console.error("Failed to save note", err);
      });
      await state.running;
      state.running = null;
    }
  }, []);

  const scheduleWrite = useCallback(
    (note: Note): void => {
      let state = writeStates.current.get(note.id);
      if (!state) {
        state = { timer: null, pending: null, running: null };
        writeStates.current.set(note.id, state);
      }
      state.pending = note;
      if (state.timer !== null) window.clearTimeout(state.timer);
      state.timer = window.setTimeout(() => {
        if (state) state.timer = null;
        void flushNote(note.id);
      }, AUTOSAVE_MS);
    },
    [flushNote],
  );

  const flushAllPending = useCallback(async (): Promise<void> => {
    const ids = [...writeStates.current.keys()];
    for (const id of ids) {
      const state = writeStates.current.get(id);
      if (state?.timer !== null && state?.timer !== undefined) {
        window.clearTimeout(state.timer);
        state.timer = null;
      }
      await flushNote(id);
    }
  }, [flushNote]);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError(null);
    (async () => {
      try {
        // Only the returning reader streams. A first-run library is empty and
        // about to be seeded, so there is nothing to show early and a partial
        // paint would only flash before the samples land.
        const streaming = hasSeeded();
        let shown = 0;

        const existing = await store.list(
          streaming
            ? (batch) => {
                if (cancelled) return;
                // Paint the first batch immediately, then at most every 50ms.
                // The read is paced by file count, so a large library would
                // otherwise re-sort and re-render the whole list a few hundred
                // times on the way up, spending more on showing progress than
                // on the work it is reporting.
                const now = performance.now();
                if (shown !== 0 && now - shown < 50) return;
                shown = now;
                setNotes((prev) => mergeBatch(prev, batch));
                setStatus("ready");
              }
            : undefined,
        );
        if (cancelled) return;

        // Re-check hasSeeded after the first await. Under StrictMode the
        // effect runs twice; if the first pass already marked seeded, this
        // pass must NOT generate a fresh set of sample ids and write five
        // more copies. Combined with the stable ids in sampleNotes.ts this
        // makes the seeding path idempotent under any timing.
        if (hasSeeded()) {
          setNotes(sortByCreated(existing));
          setStatus("ready");
          return;
        }

        const seeded = sampleNotes();
        for (const note of seeded) {
          if (cancelled) return;
          await store.put(note);
        }
        if (cancelled) return;
        markSeeded();

        const byId = new Map<string, Note>();
        for (const n of existing) byId.set(n.id, n);
        for (const n of seeded) byId.set(n.id, n);
        setNotes(sortByCreated([...byId.values()]));
        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setError(e instanceof Error ? e.message : "Failed to load notes");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store]);

  /**
   * Focus reconciliation. Drive syncs files behind the app's back, and users
   * edit them in Obsidian or a text editor. On every window focus we re-read
   * the store and reconcile:
   *
   *  - a note that is dirty locally (pending or in-flight write) always wins;
   *    if the disk copy is newer, we warn the user so silent data loss cannot
   *    happen.
   *  - otherwise, higher updatedAt wins.
   *  - a note gone from disk while dirty locally stays; a note gone from disk
   *    and clean locally is treated as an external delete and removed.
   *
   * This runs for every backend, not just the folder store. It is a no-op for
   * localStorage because nothing else writes to it, but keeping one code path
   * is safer than diverging on backend type.
   */
  const reconcile = useCallback(async (): Promise<void> => {
    if (storeRef.current !== store) return;
    let fresh: Note[];
    try {
      fresh = await store.list();
    } catch {
      return;
    }
    if (storeRef.current !== store) return;

    const conflicts: ExternalConflict[] = [];
    const freshById = new Map(fresh.map((n) => [n.id, n]));
    const prev = notesRef.current;
    const nextById = new Map<string, Note>();

    for (const local of prev) {
      const remote = freshById.get(local.id);
      if (isDirty(local.id)) {
        if (remote && remote.updatedAt > local.updatedAt) {
          conflicts.push({ id: local.id, title: local.title || "Untitled" });
        }
        nextById.set(local.id, local);
        continue;
      }
      if (!remote) continue;
      nextById.set(
        local.id,
        remote.updatedAt > local.updatedAt ? remote : local,
      );
    }

    for (const [id, remote] of freshById) {
      if (nextById.has(id)) continue;
      // A note the user just deleted may still be on disk for the brief
      // window between the optimistic UI removal and the store.remove()
      // completing. Do not resurrect it: pendingDeletions is the record
      // of that window.
      if (pendingDeletions.current.has(id)) continue;
      nextById.set(id, remote);
    }

    setNotes(sortByCreated([...nextById.values()]));
    if (conflicts.length > 0) {
      setExternalConflicts((prevConflicts) => {
        const seen = new Set(prevConflicts.map((c) => c.id));
        const merged = [...prevConflicts];
        for (const c of conflicts) {
          if (!seen.has(c.id)) merged.push(c);
        }
        return merged;
      });
    }
  }, [isDirty, store]);

  useEffect(() => {
    if (status !== "ready") return;
    const onFocus = () => {
      void reconcile();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reconcile, status]);

  const dismissConflict = useCallback((id: string) => {
    setExternalConflicts((prev) => prev.filter((c) => c.id !== id));
  }, []);

  useEffect(() => {
    const onUnload = () => {
      void flushAllPending();
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [flushAllPending]);

  useEffect(
    () => () => {
      void flushAllPending();
    },
    [flushAllPending],
  );

  const createNote = useCallback(
    (format: NoteFormat = "prose"): Note => {
      const note = newNote(format === "prose" ? {} : { format });
      setNotes((prev) => sortByCreated([note, ...prev]));
      scheduleWrite(note);
      return note;
    },
    [scheduleWrite],
  );

  /**
   * Format is its own kind of change, so it gets its own function rather than
   * joining updateNote's patch. updateNote takes a partial and reads "absent"
   * as "unchanged", which works for title and body but cannot express this
   * one: prose is stored as the *absence* of the format key, so a patch of
   * `{ format: undefined }` is indistinguishable from not asking to change it.
   *
   * Carrying prose as an absent key rather than `format: "prose"` is
   * deliberate and worth keeping. Most of the library is prose, and writing
   * the key would rewrite hundreds of files on disk to say what the default
   * already says.
   *
   * Nothing here touches the body. The same characters are laid out
   * differently, so switching back and forth has to return the note the writer
   * typed, byte for byte.
   */
  const setNoteFormat = useCallback(
    (id: string, format: NoteFormat) => {
      const current = notesRef.current.find((n) => n.id === id);
      if (!current) return;
      // Already in that shape. Same reasoning as updateNote's no-op guard:
      // restamping updatedAt here would mark an untouched note as edited and
      // rewrite its file for nothing.
      if ((current.format ?? "prose") === format) return;

      const { format: _dropped, ...withoutFormat } = current;
      const nextNote: Note = {
        ...withoutFormat,
        ...(format === "prose" ? {} : { format }),
        updatedAt: new Date().toISOString(),
      };
      setNotes((prev) =>
        sortByCreated(prev.map((n) => (n.id === id ? nextNote : n))),
      );
      scheduleWrite(nextNote);
    },
    [scheduleWrite],
  );

  const updateNote = useCallback(
    (id: string, patch: { title?: string; body?: string }) => {
      const current = notesRef.current.find((n) => n.id === id);
      if (!current) return;
      const title = patch.title ?? current.title;
      const body = patch.body ?? current.body;
      // A patch that changes nothing is not an edit. Without this guard any
      // caller that hands back the current value still restamps updatedAt and
      // schedules a disk write, which reorders the rail, marks an untouched
      // note "Edited just now", and quietly rewrites the file on open.
      if (title === current.title && body === current.body) return;
      const tags =
        body === current.body
          ? current.tags
          : mergeTags(current.tags, current.body, body);
      const nextNote: Note = {
        ...current,
        title,
        body,
        tags,
        updatedAt: new Date().toISOString(),
      };
      setNotes((prev) =>
        sortByCreated(prev.map((n) => (n.id === id ? nextNote : n))),
      );
      scheduleWrite(nextNote);
    },
    [scheduleWrite],
  );

  /**
   * Retire a note's write pipeline before the store-level remove runs.
   * Steps, in order:
   *
   *   1. Cancel the pending debounce timer so no NEW write starts.
   *   2. Null out `pending` so if a write IS in flight, it will not chain a
   *      follow-up put when the current one resolves (see flushNote's
   *      while-loop).
   *   3. Await `running` if there is one. That guarantees the on-disk state
   *      has stabilised BEFORE we call store.remove, which matters for the
   *      folder store: a put in flight will publish the file at close(),
   *      and only after that does its rename cache update. If we called
   *      remove without awaiting, remove could scan for a filename that
   *      does not exist yet, no-op, and then the put would commit the file
   *      with nothing to delete it.
   *   4. Drop the write-state entry.
   *
   * Any focus-driven reconcile that lands during step 3 must not resurrect
   * the note from disk, hence pendingDeletions in reconcile.
   */
  const retireWriteState = useCallback(async (id: string): Promise<void> => {
    const state = writeStates.current.get(id);
    if (!state) return;
    if (state.timer !== null) {
      window.clearTimeout(state.timer);
      state.timer = null;
    }
    state.pending = null;
    if (state.running) {
      try {
        await state.running;
      } catch {
        // The put may fail; that is fine for deletion. Errors were already
        // logged by flushNote's catch.
      }
    }
    writeStates.current.delete(id);
  }, []);

  const deleteNote = useCallback(
    (id: string) => {
      setNotes((prev) => prev.filter((n) => n.id !== id));
      pendingDeletions.current.add(id);
      void (async () => {
        try {
          await retireWriteState(id);
          await storeRef.current.remove(id);
        } catch (err) {
          console.error("Failed to delete note", err);
        } finally {
          pendingDeletions.current.delete(id);
        }
      })();
    },
    [retireWriteState],
  );

  const deleteSampleNotes = useCallback(() => {
    const toDelete = notesRef.current
      .filter((n) => n.tags.includes("sample"))
      .map((n) => n.id);
    if (toDelete.length === 0) return;
    const toDeleteSet = new Set(toDelete);
    setNotes((prev) => prev.filter((n) => !toDeleteSet.has(n.id)));
    for (const id of toDelete) pendingDeletions.current.add(id);
    void (async () => {
      for (const id of toDelete) {
        try {
          await retireWriteState(id);
          await storeRef.current.remove(id);
        } catch (err) {
          console.error("Failed to delete sample note", err);
        } finally {
          pendingDeletions.current.delete(id);
        }
      }
    })();
  }, [retireWriteState]);

  const hasSampleNotes = useMemo(
    () => notes.some((n) => n.tags.includes("sample")),
    [notes],
  );

  return {
    notes,
    status,
    error,
    readAsset,
    storeLabel: store.label,
    storeKind: store.kind,
    createNote,
    updateNote,
    setNoteFormat,
    deleteNote,
    hasSampleNotes,
    deleteSampleNotes,
    externalConflicts,
    dismissConflict,
  };
};
