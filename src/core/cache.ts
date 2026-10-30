// Video lengths saved between runs (IndexedDB "yws", store "videos"). YouTube API policy:
// stored API data must be refreshed or deleted within 30 days, so older records are deleted
// whenever the cache is opened and their videos are looked up again.

const DB_NAME = "yws";
const DB_VERSION = 1;
const STORE = "videos";
export const CACHE_MAX_AGE_MS = 30 * 24 * 3600 * 1000;

export interface CachedVideo {
  id: string;
  /** null = no length (deleted, private, live or upcoming). */
  durationSec: number | null;
  categoryId: string | null;
  /** liveBroadcastContent ("none", "live", "upcoming"); null when missing. */
  live: string | null;
  /** ms since the epoch. */
  fetchedAt: number;
  /** Not returned by the API: deleted or private. */
  missing?: boolean;
}

export interface VideoStore {
  /** Records fetched less than 30 days before `now`; older ones are deleted. */
  load(now: number): Promise<Map<string, CachedVideo>>;
  save(videos: readonly CachedVideo[]): Promise<void>;
  close?(): void;
}

function isFresh(v: CachedVideo, now: number): boolean {
  return now - v.fetchedAt < CACHE_MAX_AGE_MS;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function completion(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new DOMException("The cache update was aborted.", "AbortError"));
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" }).createIndex("fetchedAt", "fetchedAt");
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close(); // let a newer version of the app upgrade it
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
}

async function deleteExpired(db: IDBDatabase, now: number): Promise<void> {
  const tx = db.transaction(STORE, "readwrite");
  const cursorReq = tx.objectStore(STORE).index("fetchedAt").openCursor(IDBKeyRange.upperBound(now - CACHE_MAX_AGE_MS));
  cursorReq.onsuccess = () => {
    const cursor = cursorReq.result;
    if (cursor) {
      cursor.delete();
      cursor.continue();
    }
  };
  await completion(tx);
}

async function withDb<T>(fn: (db: IDBDatabase) => Promise<T>): Promise<T> {
  const db = await openDb();
  try {
    return await fn(db);
  } finally {
    db.close();
  }
}

/** The IndexedDB cache, open until close(). Without IndexedDB it keeps nothing. */
export async function openVideoStore(): Promise<VideoStore> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return memoryVideoStore();
  }
  return {
    async load(now) {
      await deleteExpired(db, now);
      const tx = db.transaction(STORE, "readonly");
      const all = await request(tx.objectStore(STORE).getAll() as IDBRequest<CachedVideo[]>);
      return new Map(all.filter((v) => isFresh(v, now)).map((v) => [v.id, v]));
    },
    async save(videos) {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      for (const v of videos) store.put(v);
      await completion(tx);
    },
    close() {
      db.close();
    },
  };
}

/** An in-memory store (tests, or when IndexedDB is unavailable). */
export function memoryVideoStore(initial: readonly CachedVideo[] = []): VideoStore {
  const records = new Map(initial.map((v) => [v.id, v]));
  return {
    async load(now) {
      for (const [id, v] of records) if (!isFresh(v, now)) records.delete(id);
      return new Map(records);
    },
    async save(videos) {
      for (const v of videos) records.set(v.id, v);
    },
  };
}

/** Saved video lengths. Deletes expired records first, so the numbers describe what's kept. */
export async function cacheStats(now = Date.now()): Promise<{ videos: number; oldestFetchedAt: number | null }> {
  try {
    return await withDb(async (db) => {
      await deleteExpired(db, now);
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const [videos, oldest] = await Promise.all([request(store.count()), request(store.index("fetchedAt").openCursor())]);
      return { videos, oldestFetchedAt: oldest ? (oldest.value as CachedVideo).fetchedAt : null };
    });
  } catch {
    return { videos: 0, oldestFetchedAt: null };
  }
}

export async function clearCache(): Promise<void> {
  try {
    await withDb(async (db) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      await completion(tx);
    });
  } catch {
    // Nothing saved, nothing to clear.
  }
}
