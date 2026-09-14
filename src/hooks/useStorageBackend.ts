import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NotesStore } from '../storage/types';
import { createLocalStorageStore } from '../storage/localStorageStore';
import {
  createFileSystemStore,
  isFolderStoreSupported,
} from '../storage/fileSystemStore';
import {
  clearDirectoryHandle,
  loadDirectoryHandle,
  saveDirectoryHandle,
} from '../storage/handleStore';
import { mergeStores } from '../storage/mergeStores';

/**
 * State of the folder-sync feature.
 *
 * - unsupported: browser has no File System Access API. localStorage is the
 *   only option. UI must say so plainly, not just disable a button.
 * - disconnected: browser supports it but no folder is chosen. User can
 *   connect one.
 * - connected: folder chosen, permission granted, reads and writes work.
 * - needs-reconnect: folder chosen on a previous session but permission is
 *   in 'prompt' state after reload. Chrome requires a user gesture to
 *   re-grant. We MUST NOT call requestPermission automatically. The UI
 *   surfaces a "Reconnect" button that calls it from a click handler.
 * - denied: folder chosen previously but permission is denied. Same as
 *   disconnected from the app's point of view.
 */
export type FolderState =
  | 'unsupported'
  | 'disconnected'
  | 'connected'
  | 'needs-reconnect'
  | 'denied';

export interface UseStorageBackendResult {
  store: NotesStore | null;
  folderState: FolderState;
  folderName: string | null;
  connectError: string | null;
  connectFolder: () => Promise<void>;
  reconnectFolder: () => Promise<void>;
  disconnectFolder: () => Promise<void>;
}

const buildFolderStore = (handle: FileSystemDirectoryHandle) =>
  createFileSystemStore(handle);

export const useStorageBackend = (): UseStorageBackendResult => {
  const [store, setStore] = useState<NotesStore | null>(null);
  const [folderState, setFolderState] = useState<FolderState>('disconnected');
  const [folderName, setFolderName] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  const handleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const localStoreRef = useRef<NotesStore | null>(null);

  const getLocalStore = useCallback((): NotesStore => {
    if (!localStoreRef.current) {
      localStoreRef.current = createLocalStorageStore();
    }
    return localStoreRef.current;
  }, []);

  // Bootstrap on mount: figure out which store to use without calling any
  // permission APIs that need a user gesture.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isFolderStoreSupported()) {
        if (!cancelled) {
          setStore(getLocalStore());
          setFolderState('unsupported');
        }
        return;
      }

      const stored = await loadDirectoryHandle();
      if (cancelled) return;

      if (!stored) {
        setStore(getLocalStore());
        setFolderState('disconnected');
        return;
      }

      handleRef.current = stored;
      setFolderName(stored.name);

      // queryPermission does not require a user gesture. requestPermission does.
      let permission: PermissionState = 'prompt';
      try {
        permission = await stored.queryPermission({ mode: 'readwrite' });
      } catch {
        permission = 'prompt';
      }
      if (cancelled) return;

      if (permission === 'granted') {
        setStore(buildFolderStore(stored));
        setFolderState('connected');
      } else if (permission === 'denied') {
        setStore(getLocalStore());
        setFolderState('denied');
      } else {
        // 'prompt' — do NOT call requestPermission here. Fall back to
        // localStorage so the app is functional, and surface a Reconnect
        // affordance in the UI.
        setStore(getLocalStore());
        setFolderState('needs-reconnect');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getLocalStore]);

  const connectFolder = useCallback(async (): Promise<void> => {
    setConnectError(null);
    if (!isFolderStoreSupported() || !window.showDirectoryPicker) {
      setConnectError('Folder sync is only available in Chrome or Edge.');
      return;
    }

    let picked: FileSystemDirectoryHandle;
    try {
      picked = await window.showDirectoryPicker({ mode: 'readwrite' });
    } catch (err) {
      // AbortError when the user dismisses the picker. Not an error worth showing.
      if (err instanceof Error && err.name === 'AbortError') return;
      setConnectError(
        err instanceof Error ? err.message : 'Could not open the folder picker.'
      );
      return;
    }

    let permission: PermissionState;
    try {
      permission = await picked.queryPermission({ mode: 'readwrite' });
      if (permission !== 'granted') {
        permission = await picked.requestPermission({ mode: 'readwrite' });
      }
    } catch (err) {
      setConnectError(
        err instanceof Error ? err.message : 'Could not get write access to that folder.'
      );
      return;
    }
    if (permission !== 'granted') {
      setConnectError('Write access to the folder was not granted.');
      return;
    }

    const folder = buildFolderStore(picked);

    // Migrate localStorage notes into the folder. mergeStores unions by id
    // and only writes when the source copy is newer, so an existing folder
    // library is never blindly overwritten.
    try {
      const local = getLocalStore();
      await mergeStores(local, folder);
    } catch (err) {
      setConnectError(
        err instanceof Error
          ? `Could not migrate notes into the folder: ${err.message}`
          : 'Could not migrate notes into the folder.'
      );
      return;
    }

    try {
      await saveDirectoryHandle(picked);
    } catch {
      // Persisting the handle is best-effort. The store still works this session.
    }

    handleRef.current = picked;
    setFolderName(picked.name);
    setFolderState('connected');
    setStore(folder);
  }, [getLocalStore]);

  const reconnectFolder = useCallback(async (): Promise<void> => {
    setConnectError(null);
    const stored = handleRef.current ?? (await loadDirectoryHandle());
    if (!stored) {
      setFolderState('disconnected');
      return;
    }

    let permission: PermissionState;
    try {
      permission = await stored.requestPermission({ mode: 'readwrite' });
    } catch (err) {
      setConnectError(
        err instanceof Error ? err.message : 'Could not reconnect to the folder.'
      );
      return;
    }

    if (permission === 'granted') {
      const folder = buildFolderStore(stored);

      // While the folder was disconnected, the user may have created or
      // edited notes against localStorage. Merge those into the folder
      // BEFORE swapping stores, or the swap loses their interim work.
      // mergeStores is last-write-wins on updatedAt, so a newer folder copy
      // (e.g. edited on another machine and synced by Drive) still wins.
      try {
        await mergeStores(getLocalStore(), folder);
      } catch (err) {
        setConnectError(
          err instanceof Error
            ? `Could not merge browser notes into the folder: ${err.message}`
            : 'Could not merge browser notes into the folder.'
        );
        return;
      }

      handleRef.current = stored;
      setFolderName(stored.name);
      setFolderState('connected');
      setStore(folder);
    } else if (permission === 'denied') {
      setFolderState('denied');
    } else {
      setFolderState('needs-reconnect');
    }
  }, [getLocalStore]);

  const disconnectFolder = useCallback(async (): Promise<void> => {
    setConnectError(null);
    const active = store;
    const local = getLocalStore();
    // Best-effort backfill: copy anything newer from the folder into
    // localStorage before disconnecting, so the user does not lose recent
    // work when they come back offline.
    if (active && active.kind === 'folder') {
      try {
        await mergeStores(active, local);
      } catch {
        // ignore, disconnect proceeds
      }
    }
    await clearDirectoryHandle();
    handleRef.current = null;
    setFolderName(null);
    setFolderState('disconnected');
    setStore(local);
  }, [getLocalStore, store]);

  return useMemo<UseStorageBackendResult>(
    () => ({
      store,
      folderState,
      folderName,
      connectError,
      connectFolder,
      reconnectFolder,
      disconnectFolder,
    }),
    [
      store,
      folderState,
      folderName,
      connectError,
      connectFolder,
      reconnectFolder,
      disconnectFolder,
    ]
  );
};
