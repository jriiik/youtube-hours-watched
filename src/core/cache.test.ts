import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CACHE_MAX_AGE_MS, cacheStats, clearCache, deleteExpiredVideos, memoryVideoStore, openVideoStore } from "./cache";
import type { CachedVideo } from "./cache";

const NOW = Date.UTC(2026, 9, 30, 12);
const DAY = 24 * 3600 * 1000;

const video = (id: string, ageDays: number, extra: Partial<CachedVideo> = {}): CachedVideo => ({
  id,
  durationSec: 300,
  categoryId: "20",
  live: "none",
  fetchedAt: NOW - ageDays * DAY,
  ...extra,
});

/** Opens the cache's database directly, not through cache.ts. */
const openRaw = (version?: number) =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open("yws", version);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

/** The IDs saved on disk. Reads through cache.ts delete expired records first, so this one goes around it. */
async function savedIds(): Promise<string[]> {
  const db = await openRaw();
  const ids = await new Promise<string[]>((resolve, reject) => {
    const req = db.transaction("videos").objectStore("videos").getAllKeys();
    req.onsuccess = () => resolve(req.result as string[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return ids;
}

describe("IndexedDB cache", () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
  });

  it("saves and loads video lengths", async () => {
    const store = await openVideoStore();
    await store.save([video("vid0000001a", 0), video("vid0000002a", 1, { durationSec: null, categoryId: null, live: null, missing: true })]);
    const loaded = await store.load(NOW);
    store.close?.();
    expect([...loaded.keys()]).toEqual(["vid0000001a", "vid0000002a"]);
    expect(loaded.get("vid0000002a")).toEqual(video("vid0000002a", 1, { durationSec: null, categoryId: null, live: null, missing: true }));

    const again = await openVideoStore(); // persisted
    expect((await again.load(NOW)).size).toBe(2);
    again.close?.();
  });

  it("deletes records older than 30 days so they are fetched again", async () => {
    const store = await openVideoStore();
    await store.save([video("fresh000001", 29), video("expired0001", 31), video("expired0002", 30)]);
    expect([...(await store.load(NOW)).keys()]).toEqual(["fresh000001"]);
    store.close?.();
    expect(await cacheStats(NOW)).toEqual({ videos: 1, oldestFetchedAt: NOW - 29 * DAY });
    expect(CACHE_MAX_AGE_MS).toBe(30 * DAY);
  });

  it("expires records dated ahead, saved while the PC's clock was wrong", async () => {
    const store = await openVideoStore();
    await store.save([video("today000001", 0), video("soon0000001", -0.5), video("ahead000001", -60)]);
    expect([...(await store.load(NOW)).keys()].sort()).toEqual(["soon0000001", "today000001"]);
    store.close?.();
    expect(await cacheStats(NOW)).toMatchObject({ videos: 2 }); // and deleted
    expect([...(await memoryVideoStore([video("ahead000001", -60)]).load(NOW)).keys()]).toEqual([]);
  });

  it("deletes expired records when the app starts, keeping fresh ones", async () => {
    const store = await openVideoStore();
    await store.save([
      video("fresh000001", 29),
      video("today000001", 0),
      video("soon0000001", -0.5),
      video("expired0001", 30),
      video("expired0002", 400),
      video("ahead000001", -1),
      video("ahead000002", -60),
    ]);
    store.close?.();
    // Twice at once, as React's StrictMode runs effects in development.
    await Promise.all([deleteExpiredVideos(NOW), deleteExpiredVideos(NOW)]);
    expect(await savedIds()).toEqual(["fresh000001", "soon0000001", "today000001"]);
  });

  it("does nothing when the database can't be opened", async () => {
    (await openRaw(2)).close(); // upgraded by a newer version of the app
    await expect(deleteExpiredVideos(NOW)).resolves.toBeUndefined();
  });

  it("reports and clears what is saved", async () => {
    expect(await cacheStats(NOW)).toEqual({ videos: 0, oldestFetchedAt: null });
    const store = await openVideoStore();
    await store.save([video("vid0000001a", 2), video("vid0000002a", 5), video("vid0000003a", 1)]);
    store.close?.();
    expect(await cacheStats(NOW)).toEqual({ videos: 3, oldestFetchedAt: NOW - 5 * DAY });
    await clearCache();
    expect(await cacheStats(NOW)).toEqual({ videos: 0, oldestFetchedAt: null });
  });
});

describe("without IndexedDB", () => {
  const saved = globalThis.indexedDB;
  beforeEach(() => {
    (globalThis as { indexedDB?: IDBFactory }).indexedDB = undefined;
  });
  afterEach(() => {
    globalThis.indexedDB = saved;
  });

  it("keeps working, without saving anything", async () => {
    const store = await openVideoStore();
    await store.save([video("vid0000001a", 0)]);
    expect((await store.load(NOW)).size).toBe(1);
    expect(await cacheStats(NOW)).toEqual({ videos: 0, oldestFetchedAt: null });
    await expect(clearCache()).resolves.toBeUndefined();
    await expect(deleteExpiredVideos(NOW)).resolves.toBeUndefined();
  });
});

describe("memoryVideoStore", () => {
  it("expires records like the real cache", async () => {
    const store = memoryVideoStore([video("fresh000001", 3), video("expired0001", 40)]);
    expect([...(await store.load(NOW)).keys()]).toEqual(["fresh000001"]);
  });
});
