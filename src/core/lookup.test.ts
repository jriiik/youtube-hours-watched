import { describe, expect, it } from "vitest";
import { fakeId } from "./__fixtures__/takeout";
import { memoryVideoStore } from "./cache";
import type { CachedVideo, VideoStore } from "./cache";
import { AnalysisError } from "./errors";
import { lookupVideos } from "./lookup";
import type { Progress } from "./types";
import type { FetchLike } from "./youtubeApi";

const NOW = Date.UTC(2026, 9, 30, 12);
const DAY = 24 * 3600 * 1000;
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const idsOf = (url: string) => new URL(url).searchParams.get("id")!.split(",");

function api(missing: string[] = []) {
  const asked: string[] = [];
  const fetch: FetchLike = async (url) => {
    asked.push(...idsOf(url));
    return json(200, {
      items: idsOf(url)
        .filter((id) => !missing.includes(id))
        .map((id) => ({ id, contentDetails: { duration: "PT2M" }, snippet: { categoryId: "10", liveBroadcastContent: "none" } })),
    });
  };
  return { fetch, asked };
}

const cached = (id: string, ageDays: number): CachedVideo => ({ id, durationSec: 60, categoryId: "20", live: "none", fetchedAt: NOW - ageDays * DAY });

describe("lookupVideos", () => {
  it("uses fresh cache entries and looks up the rest, saving them", async () => {
    const ids = Array.from({ length: 60 }, (_, i) => fakeId(i));
    const store = memoryVideoStore([cached(ids[0], 1), cached(ids[1], 45)]);
    const { fetch, asked } = api([ids[2]]);
    const progress: Progress[] = [];
    const result = await lookupVideos(ids, { apiKey: "k", store, fetch, now: NOW, onProgress: (p) => progress.push(p) });
    expect(asked).not.toContain(ids[0]);
    expect(asked).toContain(ids[1]); // expired
    expect(result).toMatchObject({ total: 60, fromCache: 1, fetched: 59, missing: 1, noLength: 0, quotaExceeded: false, notLookedUp: 0 });
    expect(result.videos.get(ids[0])).toEqual({ durationSec: 60, categoryId: "20" });
    expect(result.videos.get(ids[2])).toEqual({ durationSec: null, categoryId: null });
    expect(result.videos.get(ids[3])).toEqual({ durationSec: 120, categoryId: "10" });
    expect(progress.map((p) => [p.stage, p.done, p.total])).toEqual([
      ["lookup", 0, 2],
      ["lookup", 1, 2],
      ["lookup", 2, 2],
    ]);
    const saved = await store.load(NOW);
    expect(saved.size).toBe(60);
    expect(saved.get(ids[2])).toMatchObject({ missing: true, fetchedAt: NOW });

    const second = api();
    const again = await lookupVideos(ids, { apiKey: "k", store, fetch: second.fetch, now: NOW + DAY });
    expect(second.asked).toEqual([]);
    expect(again).toMatchObject({ fromCache: 60, fetched: 0, missing: 1 });
  });

  it("keeps going when the cache fails", async () => {
    const broken: VideoStore = {
      load: () => Promise.reject(new Error("broken")),
      save: () => Promise.reject(new Error("broken")),
    };
    const result = await lookupVideos([fakeId(1)], { apiKey: "k", store: broken, fetch: api().fetch, now: NOW });
    expect(result.fetched).toBe(1);
  });

  it("returns partial results when the quota runs out", async () => {
    const ids = Array.from({ length: 120 }, (_, i) => fakeId(i));
    const ok = api();
    let calls = 0;
    const fetch: FetchLike = async (url, init) =>
      ++calls === 1 ? ok.fetch(url, init) : json(403, { error: { code: 403, message: "quota", errors: [{ reason: "quotaExceeded" }] } });
    const result = await lookupVideos(ids, { apiKey: "k", store: memoryVideoStore(), fetch, now: NOW });
    expect(result).toMatchObject({ quotaExceeded: true, fetched: 50, notLookedUp: 70 });
    expect(result.videos.size).toBe(50);
  });

  it("turns key problems into AnalysisErrors", async () => {
    const fetch: FetchLike = async () =>
      json(403, { error: { code: 403, message: "Access Not Configured", errors: [{ reason: "accessNotConfigured" }] } });
    const run = lookupVideos([fakeId(1)], { apiKey: "k", store: memoryVideoStore(), fetch, now: NOW });
    await expect(run).rejects.toBeInstanceOf(AnalysisError);
    await expect(run).rejects.toMatchObject({ reason: "api-not-enabled" });
  });
});
