/**
 * Keeps the last uploaded CSV in IndexedDB. Storage can be unavailable (private mode,
 * blocked site data), so every operation fails quietly and the app works without it.
 */
const DB_NAME = "prognosys";
const STORE = "files";
const KEY = "current";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  try {
    const db = await openDb();
    return await new Promise<T>((resolve, reject) => {
      const req = op(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function loadStoredFile(): Promise<File | null> {
  const value = await run<unknown>("readonly", (s) => s.get(KEY));
  return value instanceof File ? value : null;
}

export function storeFile(file: File) {
  return run("readwrite", (s) => s.put(file, KEY));
}

export function clearStoredFile() {
  return run("readwrite", (s) => s.delete(KEY));
}
