/**
 * Persists the chosen `FileSystemDirectoryHandle` in IndexedDB.
 *
 * The handle is a structured-clone object that survives across reloads only
 * inside IndexedDB. localStorage cannot store it. The rest of the app should
 * never see raw IDB: it asks this module for the handle and gets a handle or
 * null back.
 *
 * The store is intentionally raw IDB. Wrappers save a few lines and add a
 * dependency; this file is a few lines with no dependency.
 */

const DB_NAME = 'glassbox';
const DB_VERSION = 1;
const STORE_NAME = 'handles';
const HANDLE_KEY = 'directory';

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const withStore = async <T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> => {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      const req = action(store);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
};

const isIndexedDbAvailable = (): boolean => {
  try {
    return typeof indexedDB !== 'undefined';
  } catch {
    return false;
  }
};

export const saveDirectoryHandle = async (
  handle: FileSystemDirectoryHandle
): Promise<void> => {
  if (!isIndexedDbAvailable()) return;
  await withStore('readwrite', (store) => store.put(handle, HANDLE_KEY));
};

export const loadDirectoryHandle =
  async (): Promise<FileSystemDirectoryHandle | null> => {
    if (!isIndexedDbAvailable()) return null;
    try {
      const value = await withStore('readonly', (store) => store.get(HANDLE_KEY));
      if (
        value &&
        typeof value === 'object' &&
        (value as FileSystemHandle).kind === 'directory'
      ) {
        return value as FileSystemDirectoryHandle;
      }
      return null;
    } catch {
      return null;
    }
  };

export const clearDirectoryHandle = async (): Promise<void> => {
  if (!isIndexedDbAvailable()) return;
  try {
    await withStore('readwrite', (store) => store.delete(HANDLE_KEY));
  } catch {
    // best effort
  }
};
