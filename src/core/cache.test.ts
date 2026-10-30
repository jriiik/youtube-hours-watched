import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CACHE_MAX_AGE_MS, cacheStats, clearCache, memoryVideoStore, openVideoStore } from "./cache";
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
  });
});

describe("memoryVideoStore", () => {
  it("expires records like the real cache", async () => {
    const store = memoryVideoStore([video("fresh000001", 3), video("expired0001", 40)]);
    expect([...(await store.load(NOW)).keys()]).toEqual(["fresh000001"]);
  });
});
