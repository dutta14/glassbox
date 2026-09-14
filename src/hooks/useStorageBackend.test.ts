import { describe, expect, it, beforeEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useStorageBackend } from './useStorageBackend';
import * as handleStore from '../storage/handleStore';
import * as fileSystemStore from '../storage/fileSystemStore';
import { createLocalStorageStore } from '../storage/localStorageStore';
import type { NotesStore } from '../storage/types';
import type { Note } from '../types';

interface FakeHandleOptions {
  initialPermission?: PermissionState;
  requestResult?: PermissionState;
  requestThrows?: Error;
}

/**
 * Minimal FileSystemDirectoryHandle stand-in. Tracks permission-related calls
 * so tests can assert about how the hook interacted with the browser.
 */
class FakeDirHandle {
  kind = 'directory' as const;
  name = 'test-folder';
  queryCalls = 0;
  requestCalls = 0;
  #current: PermissionState;
  #requestResult: PermissionState;
  #requestThrows?: Error;

  constructor(opts: FakeHandleOptions = {}) {
    this.#current = opts.initialPermission ?? 'prompt';
    this.#requestResult = opts.requestResult ?? 'granted';
    this.#requestThrows = opts.requestThrows;
  }

  async queryPermission(): Promise<PermissionState> {
    this.queryCalls += 1;
    return this.#current;
  }

  async requestPermission(): Promise<PermissionState> {
    this.requestCalls += 1;
    if (this.#requestThrows) throw this.#requestThrows;
    this.#current = this.#requestResult;
    return this.#requestResult;
  }
}

/**
 * A NotesStore stub that stands in for a real folder store. All methods just
 * write to an in-memory Map so we can observe what merged where.
 */
class InMemoryStore implements NotesStore {
  readonly kind = 'folder' as const;
  readonly label = 'fake-folder';
  disk = new Map<string, Note>();
  putCalls: Note[] = [];
  removeCalls: string[] = [];
  isAvailable(): boolean {
    return true;
  }
  async list(): Promise<Note[]> {
    return [...this.disk.values()];
  }
  async put(note: Note): Promise<void> {
    this.putCalls.push(note);
    this.disk.set(note.id, note);
  }
  async remove(id: string): Promise<void> {
    this.removeCalls.push(id);
    this.disk.delete(id);
  }
}

const mk = (id: string, updatedAt: string, body = 'body'): Note => ({
  id,
  title: `Title ${id}`,
  body,
  tags: [],
  createdAt: updatedAt,
  updatedAt,
});

const setupHandle = (handle: FakeDirHandle | null): void => {
  vi.spyOn(handleStore, 'loadDirectoryHandle').mockResolvedValue(
    handle as unknown as FileSystemDirectoryHandle | null
  );
  vi.spyOn(handleStore, 'saveDirectoryHandle').mockResolvedValue(undefined);
  vi.spyOn(handleStore, 'clearDirectoryHandle').mockResolvedValue(undefined);
};

describe('useStorageBackend.reconnectFolder — bug 2 regression (merge skipped on reconnect)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.spyOn(fileSystemStore, 'isFolderStoreSupported').mockReturnValue(true);
  });

  it('migrates notes created against localStorage while disconnected into the folder store on reconnect', async () => {
    const handle = new FakeDirHandle({ initialPermission: 'prompt', requestResult: 'granted' });
    setupHandle(handle);

    // Folder store is initially empty. The user was writing to localStorage
    // while the folder was in the 'needs-reconnect' state.
    const folder = new InMemoryStore();
    const createFolder = vi
      .spyOn(fileSystemStore, 'createFileSystemStore')
      .mockReturnValue(folder);

    // Seed localStorage with a note the user made while disconnected. This
    // uses the same key as the real localStorage store, so getLocalStore()
    // will find it via list().
    const disconnectedNote = mk('local-1', '2026-05-01T00:00:00.000Z', 'written while offline');
    const local = createLocalStorageStore();
    await local.put(disconnectedNote);

    const { result } = renderHook(() => useStorageBackend());
    await waitFor(() => expect(result.current.folderState).toBe('needs-reconnect'));

    await act(async () => {
      await result.current.reconnectFolder();
    });

    expect(result.current.folderState).toBe('connected');
    // The folder store instance the hook is now using was our fake, and the
    // merge must have copied the disconnected note into it.
    expect(folder.disk.get('local-1')).toEqual(disconnectedNote);
    // Assert absence of any surprise: this was the only note migrated.
    expect(folder.putCalls.map((n) => n.id)).toEqual(['local-1']);
    // And the store the hook exposes is the folder store, not localStorage.
    expect(result.current.store).toBe(folder);
    createFolder.mockRestore();
  });

  it('does not clobber a newer folder copy with an older local copy on reconnect (last-write-wins on updatedAt)', async () => {
    const handle = new FakeDirHandle({ initialPermission: 'prompt', requestResult: 'granted' });
    setupHandle(handle);

    // Folder already has a newer copy (simulating a Drive sync from another
    // machine while this browser was disconnected).
    const folder = new InMemoryStore();
    const folderCopy = mk('shared-1', '2026-06-01T00:00:00.000Z', 'newer from another machine');
    folder.disk.set(folderCopy.id, folderCopy);
    vi.spyOn(fileSystemStore, 'createFileSystemStore').mockReturnValue(folder);

    // localStorage has an older copy of the same id.
    const olderLocal = mk('shared-1', '2026-05-01T00:00:00.000Z', 'older, written before Drive sync');
    const local = createLocalStorageStore();
    await local.put(olderLocal);

    const { result } = renderHook(() => useStorageBackend());
    await waitFor(() => expect(result.current.folderState).toBe('needs-reconnect'));

    await act(async () => {
      await result.current.reconnectFolder();
    });

    expect(result.current.folderState).toBe('connected');
    // Folder copy must be preserved.
    expect(folder.disk.get('shared-1')).toEqual(folderCopy);
    // Assert absence of clobber: the older local copy must NOT have been put
    // into the folder store during the merge.
    expect(folder.putCalls.find((n) => n.id === 'shared-1' && n.updatedAt === olderLocal.updatedAt)).toBeUndefined();
  });

  it('leaves the folder disconnected and performs no merge or store swap when permission is denied on reconnect', async () => {
    const handle = new FakeDirHandle({ initialPermission: 'prompt', requestResult: 'denied' });
    setupHandle(handle);

    const folder = new InMemoryStore();
    const createFolder = vi
      .spyOn(fileSystemStore, 'createFileSystemStore')
      .mockReturnValue(folder);

    const localNote = mk('local-only', '2026-05-01T00:00:00.000Z');
    const local = createLocalStorageStore();
    await local.put(localNote);

    const { result } = renderHook(() => useStorageBackend());
    await waitFor(() => expect(result.current.folderState).toBe('needs-reconnect'));

    const storeBefore = result.current.store;

    await act(async () => {
      await result.current.reconnectFolder();
    });

    expect(result.current.folderState).toBe('denied');
    // No merge occurred.
    expect(folder.putCalls).toEqual([]);
    expect(folder.disk.size).toBe(0);
    // Store was not swapped to the folder.
    expect(result.current.store).toBe(storeBefore);
    // createFileSystemStore was never called on the denied path.
    expect(createFolder).not.toHaveBeenCalled();
  });
});
