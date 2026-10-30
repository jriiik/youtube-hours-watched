import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bytes, fakeId, htmlEntry, jsonEntry, takeoutHtml, takeoutJson } from "./__fixtures__/takeout";
import { AnalysisError, analyzeHistory } from "./analyze";
import { cacheStats } from "./cache";
import type { AnalyzeResult, Progress } from "./types";
import type { WorkerReply, WorkerRequest } from "./workerMessages";

// End to end through analyzeHistory: Node has no Worker, so this is the main-thread path,
// with fetch stubbed and fake-indexeddb as the cache. A fake Worker covers worker.ts below.

const LENGTHS: Record<string, string> = { [fakeId(1)]: "PT10M", [fakeId(2)]: "PT1H", [fakeId(4)]: "PT45S", [fakeId(5)]: "PT3M" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

function stubYouTube(reply?: () => Response) {
  const fetch = vi.fn(async (url: string, _init?: { headers: Record<string, string> }) => {
    if (reply) return reply();
    const ids = new URL(url).searchParams.get("id")!.split(",");
    const items = ids
      .filter((id) => LENGTHS[id])
      .map((id) => ({ id, contentDetails: { duration: LENGTHS[id] }, snippet: { categoryId: "27", liveBroadcastContent: "none" } }));
    return json(200, { items });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

// Newest first, as Takeout writes it. fakeId(3) is deleted.
const BLOCKS = [
  htmlEntry({ videoId: fakeId(5), title: "Five", channel: "Channel B", channelId: "UCb", date: "2 Jan 2026, 10:30:00 CET" }),
  htmlEntry({ videoId: fakeId(4), title: "Four", channel: "Channel B", channelId: "UCb", date: "2 Jan 2026, 10:29:00 CET" }),
  htmlEntry({ videoId: fakeId(1), title: "An ad", channel: "Advertiser", date: "2 Jan 2026, 10:28:00 CET", ad: true }),
  htmlEntry({ videoId: fakeId(3), channel: null, date: "2 Jan 2026, 10:00:00 CET" }),
  htmlEntry({ videoId: fakeId(2), title: "Two", channel: "Channel A", channelId: "UCa", date: "1 Jan 2026, 21:00:00 CET" }),
  htmlEntry({ videoId: fakeId(1), title: "One", channel: "Channel A", channelId: "UCa", date: "31 Dec 2025, 20:00:00 CET" }),
];
const HTML = takeoutHtml(BLOCKS);

const file = () => new File([HTML], "watch-history.html", { type: "text/html" });

function stagesOf(progress: Progress[]): string[] {
  return progress.map((p) => p.stage).filter((s, i, all) => s !== all[i - 1]);
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("analyzeHistory", () => {
  it("analyses a watch history end to end", async () => {
    const fetch = stubYouTube();
    const progress: Progress[] = [];
    const { data, warnings } = await analyzeHistory(file(), { apiKey: "test-key", onProgress: (p) => progress.push(p) });

    expect(data.label).toBe("Your watch history");
    expect(data.years).toEqual(["2026", "2025"]);
    // 600 + 3600 + min(29 min, 10 min) + 45 + 180 s; the deleted video adds nothing to the upper bound.
    expect(data.views.all.summary).toMatchObject({
      estimateHours: 1.4,
      upperBoundHours: 1.2,
      entries: 5,
      uniqueVideos: 5,
      channels: 2,
      firstDate: "2025-12-31",
      lastDate: "2026-01-02",
      unavailable: { entries: 1, estimateHours: 0.2 },
      shorts: { entries: 1, estimateHours: 0 },
    });
    expect(data.views.all.categories).toEqual([
      { name: "Education", hours: 1.2 },
      { name: "Unknown", hours: 0.2 },
    ]);
    expect(stagesOf(progress)).toEqual(["reading", "parsing", "lookup", "computing", "done"]);
    expect(progress.find((p) => p.stage === "parsing")).toEqual({ stage: "parsing", done: 5, total: 5 });
    expect(progress.filter((p) => p.stage === "lookup").map((p) => [p.done, p.total])).toEqual([
      [0, 1],
      [1, 1],
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1]?.headers).toEqual({ "X-Goog-Api-Key": "test-key" });

    expect(warnings).toEqual([
      "1 of the videos you watched has no known length (deleted, private or live). It counts until the next video, at most 10 minutes.",
      "Not counted: 1 ad.",
      "Your watch history starts on 31 December 2025. Anything watched before then, or while watch history was paused, isn't in the export.",
    ]);
    expect(await cacheStats()).toMatchObject({ videos: 5 });
  });

  it("reuses saved lengths on the next run", async () => {
    stubYouTube();
    const first = await analyzeHistory(file(), { apiKey: "k" });
    const fetch = stubYouTube();
    const second = await analyzeHistory(file(), { apiKey: "k" });
    expect(fetch).not.toHaveBeenCalled();
    expect(second).toEqual(first);
  });

  it("reads the same history from a Takeout zip and from JSON", async () => {
    stubYouTube();
    const plain = await analyzeHistory(file(), { apiKey: "k" });
    const zip = zipSync({
      "Takeout/archive_browser.html": bytes("<html>index</html>"),
      "Takeout/YouTube and YouTube Music/history/watch-history.html": [bytes(HTML), { level: 6 }],
    });
    const zipped = await analyzeHistory(new File([zip], "takeout-001.zip"), { apiKey: "k" });
    expect(zipped).toEqual(plain);

    const items = [
      jsonEntry({ videoId: fakeId(5), channel: "Channel B", channelUrl: "https://www.youtube.com/channel/UCb", time: "2026-01-02T09:30:00Z" }),
      jsonEntry({ videoId: fakeId(4), channel: "Channel B", channelUrl: "https://www.youtube.com/channel/UCb", time: "2026-01-02T09:29:00Z" }),
      jsonEntry({ videoId: fakeId(1), time: "2026-01-02T09:28:00Z", ad: true }),
      jsonEntry({ videoId: fakeId(3), channel: null, time: "2026-01-02T09:00:00Z" }),
      jsonEntry({ videoId: fakeId(2), channel: "Channel A", channelUrl: "https://www.youtube.com/channel/UCa", time: "2026-01-01T20:00:00Z" }),
      jsonEntry({ videoId: fakeId(1), channel: "Channel A", channelUrl: "https://www.youtube.com/channel/UCa", time: "2025-12-31T19:00:00Z" }),
    ];
    const fromJson = await analyzeHistory(new File([takeoutJson(items)], "watch-history.json"), { apiKey: "k" });
    expect(fromJson.data.views.all.summary).toMatchObject({ entries: 5, estimateHours: 1.4, upperBoundHours: 1.2 });
  });

  it("stops with a clear error when the key doesn't work", async () => {
    stubYouTube(() =>
      json(400, {
        error: { code: 400, message: "API key not valid.", errors: [{ reason: "badRequest" }], details: [{ reason: "API_KEY_INVALID" }] },
      }),
    );
    const run = analyzeHistory(file(), { apiKey: "wrong" });
    await expect(run).rejects.toBeInstanceOf(AnalysisError);
    await expect(run).rejects.toMatchObject({ reason: "invalid", message: expect.stringContaining("API key") });
  });

  it("stops with a quota error when the quota is used up and no length is known", async () => {
    stubYouTube(() =>
      json(403, { error: { code: 403, message: "quota <a href=\"#\">quota</a>", errors: [{ reason: "quotaExceeded" }] } }),
    );
    await expect(analyzeHistory(file(), { apiKey: "k" })).rejects.toMatchObject({ reason: "quota", message: expect.not.stringContaining("<") });
  });

  it("finishes with what it has when the quota runs out, and says the numbers are incomplete", async () => {
    stubYouTube();
    await analyzeHistory(file(), { apiKey: "k" }); // saves the lengths of these five videos
    stubYouTube(() =>
      json(403, { error: { code: 403, message: "quota <a href=\"#\">quota</a>", errors: [{ reason: "quotaExceeded" }] } }),
    );
    const newer = htmlEntry({ videoId: fakeId(6), title: "Six", channel: "Channel B", channelId: "UCb", date: "3 Jan 2026, 09:00:00 CET" });
    const { data, warnings, incomplete } = await analyzeHistory(new File([takeoutHtml([newer, ...BLOCKS])], "watch-history.html"), { apiKey: "k" });
    expect(data.views.all.summary).toMatchObject({ entries: 6, unavailable: { entries: 2 } });
    expect(incomplete).toMatch(/^Your API key has no YouTube quota left today, so 1 video couldn't be looked up and counts as unknown length for now\./);
    expect(incomplete).not.toContain("<");
    expect(warnings.join(" ")).not.toContain("quota");
  });

  it("explains histories it can't use", async () => {
    stubYouTube();
    const onlyAds = takeoutHtml([htmlEntry({ videoId: fakeId(1), date: "2 Jan 2026, 10:28:00 CET", ad: true })]);
    await expect(analyzeHistory(new Blob([onlyAds]), { apiKey: "k" })).rejects.toMatchObject({ reason: "empty" });
    const strangeDates = takeoutHtml([htmlEntry({ videoId: fakeId(1), date: "le 2 janvier" })]);
    await expect(analyzeHistory(new Blob([strangeDates]), { apiKey: "k" })).rejects.toMatchObject({ reason: "dates" });
    await expect(analyzeHistory(new Blob(["hello"]), { apiKey: "k" })).rejects.toMatchObject({ reason: "not-history" });
  });

  it("can be cancelled", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(analyzeHistory(file(), { apiKey: "k", signal: ctrl.signal })).rejects.toMatchObject({ name: "AbortError" });

    const later = new AbortController();
    vi.stubGlobal("fetch", (_url: string, init: { signal: AbortSignal }) => {
      queueMicrotask(() => later.abort());
      return new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    });
    await expect(analyzeHistory(file(), { apiKey: "k", signal: later.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("analyzeHistory with a Web Worker", () => {
  // worker.ts runs against a stand-in for its global scope; FakeWorker plays the browser's
  // part between the two (asynchronous delivery, terminate()).
  const scope: { onmessage: ((event: { data: WorkerRequest }) => void) | null; postMessage(message: WorkerReply): void } = {
    onmessage: null,
    postMessage: (message) => FakeWorker.current?.deliver(message),
  };

  class FakeWorker {
    static current: FakeWorker | null = null;
    static started: { url: string; options: WorkerOptions }[] = [];
    onmessage: ((event: { data: WorkerReply }) => void) | null = null;
    onerror: ((event: { message: string; preventDefault(): void }) => void) | null = null;
    onmessageerror: (() => void) | null = null;
    terminated = false;

    constructor(url: URL, options: WorkerOptions) {
      FakeWorker.current = this;
      FakeWorker.started.push({ url: url.href, options });
    }

    postMessage(data: WorkerRequest) {
      queueMicrotask(() => scope.onmessage?.({ data }));
    }

    deliver(message: WorkerReply) {
      queueMicrotask(() => {
        if (!this.terminated) this.onmessage?.({ data: message });
      });
    }

    terminate() {
      this.terminated = true;
    }
  }

  beforeEach(async () => {
    vi.stubGlobal("self", scope);
    await import("./worker");
    vi.stubGlobal("Worker", FakeWorker);
  });

  it("runs the analysis in the worker and relays its progress", async () => {
    stubYouTube();
    const progress: Progress[] = [];
    const result = await analyzeHistory(file(), { apiKey: "k", onProgress: (p) => progress.push(p) });
    expect(FakeWorker.started[FakeWorker.started.length - 1]).toEqual({ url: expect.stringMatching(/\/worker\.ts$/), options: { type: "module" } });
    expect(FakeWorker.current?.terminated).toBe(true);
    expect(stagesOf(progress)).toEqual(["reading", "parsing", "lookup", "computing", "done"]);
    expect(result.data.views.all.summary.estimateHours).toBe(1.4);
  });

  it("passes errors back with their reason", async () => {
    stubYouTube(() => json(403, { error: { code: 403, message: "Access Not Configured", errors: [{ reason: "accessNotConfigured" }] } }));
    const run = analyzeHistory(file(), { apiKey: "k" });
    await expect(run).rejects.toBeInstanceOf(AnalysisError);
    await expect(run).rejects.toMatchObject({ reason: "api-not-enabled" });
  });

  it("falls back to this thread when the worker can't start", async () => {
    stubYouTube();
    class BrokenWorker {
      onerror: ((event: { message: string; preventDefault(): void }) => void) | null = null;
      constructor() {
        queueMicrotask(() => this.onerror?.({ message: "", preventDefault() {} }));
      }
      postMessage() {}
      terminate() {}
    }
    vi.stubGlobal("Worker", BrokenWorker);
    const result: AnalyzeResult = await analyzeHistory(file(), { apiKey: "k" });
    expect(result.data.views.all.summary.entries).toBe(5);
    vi.stubGlobal("Worker", function Unavailable() {
      throw new Error("Workers are disabled");
    });
    expect((await analyzeHistory(file(), { apiKey: "k" })).data.views.all.summary.entries).toBe(5);
  });

  it("terminates the worker when cancelled", async () => {
    stubYouTube();
    const ctrl = new AbortController();
    const run = analyzeHistory(file(), { apiKey: "k", signal: ctrl.signal, onProgress: () => ctrl.abort() });
    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    expect(FakeWorker.current?.terminated).toBe(true);
  });
});
