import { describe, expect, it, vi } from "vitest";
import { fakeId } from "./__fixtures__/takeout";
import {
  categoryName,
  explainApiError,
  fetchVideoBatch,
  fetchVideos,
  parseIsoDuration,
  testApiKey,
  videosUrl,
  YouTubeApiError,
} from "./youtubeApi";
import type { FetchLike } from "./youtubeApi";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const idsOf = (url: string) => new URL(url).searchParams.get("id")!.split(",");
const noSleep = (_ms: number) => Promise.resolve();

function googleError(code: number, message: string, reason: { detail?: string; legacy?: string }) {
  return {
    error: {
      code,
      message,
      errors: [{ message, domain: "global", reason: reason.legacy ?? "forbidden" }],
      ...(reason.detail ? { details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: reason.detail, domain: "googleapis.com" }] } : {}),
    },
  };
}

const QUOTA = googleError(403, 'The request cannot be completed because you have exceeded your <a href="/youtube/v3/getting-started#quota">quota</a>.', {
  legacy: "quotaExceeded",
});

/** A fake videos.list: every ID is a 5-minute Gaming video unless listed otherwise. */
function fakeApi(opts: { missing?: string[]; durations?: Record<string, string> } = {}) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, headers: init.headers });
    const items = idsOf(url)
      .filter((id) => !opts.missing?.includes(id))
      .map((id) => ({
        id,
        contentDetails: { duration: opts.durations?.[id] ?? "PT5M" },
        snippet: { categoryId: "20", liveBroadcastContent: opts.durations?.[id] === "P0D" ? "live" : "none" },
      }));
    return json(200, { items });
  };
  return { fetch, calls };
}

describe("parseIsoDuration", () => {
  it("reads every optional part", () => {
    expect(parseIsoDuration("PT1H2M3S")).toBe(3723);
    expect(parseIsoDuration("PT45S")).toBe(45);
    expect(parseIsoDuration("PT10M")).toBe(600);
    expect(parseIsoDuration("PT2H")).toBe(7200);
    expect(parseIsoDuration("P1DT2H")).toBe(93600);
    expect(parseIsoDuration("P1W")).toBe(604800);
  });

  it("treats zero, missing and malformed durations as unknown", () => {
    for (const value of ["P0D", "PT0S", "P", "PT", "", "1:00", "garbage", null, undefined]) expect(parseIsoDuration(value)).toBeNull();
  });
});

describe("categoryName", () => {
  it("names YouTube's categories", () => {
    expect(categoryName("20")).toBe("Gaming");
    expect(categoryName("28")).toBe("Science & Technology");
    expect(categoryName("44")).toBe("Unknown");
    expect(categoryName(null)).toBe("Unknown");
  });
});

describe("fetchVideos", () => {
  it("asks for at most 50 IDs per request, with the key header", async () => {
    const api = fakeApi();
    const ids = Array.from({ length: 120 }, (_, i) => fakeId(i));
    const batches: number[] = [];
    const result = await fetchVideos(ids, { apiKey: "my-key", fetch: api.fetch, onBatch: (videos) => void batches.push(videos.length) });
    expect(result).toEqual({ batchesDone: 3, quotaExceeded: false, notFetched: [] });
    expect(api.calls.map((c) => idsOf(c.url).length)).toEqual([50, 50, 20]);
    expect(api.calls.flatMap((c) => idsOf(c.url)).sort()).toEqual(ids);
    expect(api.calls.every((c) => c.headers["X-Goog-Api-Key"] === "my-key")).toBe(true);
    expect(batches).toEqual([50, 50, 20]);
    const url = new URL(api.calls[0].url);
    expect(url.origin + url.pathname).toBe("https://www.googleapis.com/youtube/v3/videos");
    expect(url.searchParams.get("part")).toBe("contentDetails,snippet");
    expect(url.searchParams.get("fields")).toBe("items(id,contentDetails(duration),snippet(categoryId,liveBroadcastContent))");
  });

  it("sends no key header when the key is empty (the sandbox proxy adds it)", async () => {
    const api = fakeApi();
    await fetchVideos([fakeId(1)], { apiKey: "", fetch: api.fetch });
    expect(api.calls[0].headers).toEqual({});
  });

  it("reports missing IDs as deleted or private, and zero durations as unknown", async () => {
    const api = fakeApi({ missing: [fakeId(2)], durations: { [fakeId(3)]: "P0D" } });
    const videos = await fetchVideoBatch([fakeId(1), fakeId(2), fakeId(3)], { apiKey: "k", fetch: api.fetch });
    expect(videos).toEqual([
      { id: fakeId(1), durationSec: 300, categoryId: "20", live: "none", missing: false },
      { id: fakeId(2), durationSec: null, categoryId: null, live: null, missing: true },
      { id: fakeId(3), durationSec: null, categoryId: "20", live: "live", missing: false },
    ]);
  });

  it("refuses batches over 50", async () => {
    await expect(fetchVideoBatch(Array.from({ length: 51 }, (_, i) => fakeId(i)), { apiKey: "k", fetch: fakeApi().fetch })).rejects.toThrow(RangeError);
  });

  it("keeps about six requests in flight", async () => {
    let inFlight = 0;
    let most = 0;
    const api = fakeApi();
    const fetch: FetchLike = async (url, init) => {
      most = Math.max(most, ++inFlight);
      await new Promise((resolve) => setTimeout(resolve, 2));
      inFlight--;
      return api.fetch(url, init);
    };
    await fetchVideos(Array.from({ length: 1000 }, (_, i) => fakeId(i)), { apiKey: "k", fetch });
    expect(most).toBe(6);
  });

  it("retries server errors and network failures with backoff", async () => {
    const api = fakeApi();
    const replies: (Response | "network" | null)[] = [json(503, {}), json(500, {}), json(429, {}), "network", null];
    const fetch: FetchLike = async (url, init) => {
      const next = replies.shift();
      if (next === "network") throw new TypeError("Failed to fetch");
      return next ?? api.fetch(url, init);
    };
    const sleep = vi.fn(noSleep);
    const result = await fetchVideos([fakeId(1)], { apiKey: "k", fetch, sleep });
    expect(result.batchesDone).toBe(1);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000, 4000, 8000]);
  });

  it("retries rate limits", async () => {
    const api = fakeApi();
    let first = true;
    const fetch: FetchLike = async (url, init) => {
      if (!first) return api.fetch(url, init);
      first = false;
      return json(403, googleError(403, "Rate limit", { legacy: "rateLimitExceeded" }));
    };
    expect((await fetchVideos([fakeId(1)], { apiKey: "k", fetch, sleep: noSleep })).batchesDone).toBe(1);
  });

  it("gives up after five attempts", async () => {
    const sleep = vi.fn(noSleep);
    const down = fetchVideoBatch([fakeId(1)], { apiKey: "k", fetch: async () => json(503, {}), sleep });
    await expect(down).rejects.toMatchObject({ name: "YouTubeApiError", reason: "unknown", status: 503 });
    expect(sleep).toHaveBeenCalledTimes(4);
    const offline = fetchVideoBatch([fakeId(1)], { apiKey: "k", fetch: () => Promise.reject(new TypeError("offline")), sleep: noSleep });
    await expect(offline).rejects.toMatchObject({ reason: "network" });
  });

  it("stops looking up when the quota runs out, keeping what was fetched", async () => {
    const api = fakeApi();
    let calls = 0;
    const fetch: FetchLike = async (url, init) => (++calls > 2 ? json(403, QUOTA) : api.fetch(url, init));
    const ids = Array.from({ length: 200 }, (_, i) => fakeId(i));
    const fetched: string[] = [];
    const result = await fetchVideos(ids, { apiKey: "k", fetch, concurrency: 1, onBatch: (videos) => void fetched.push(...videos.map((v) => v.id)) });
    expect(result.quotaExceeded).toBe(true);
    expect(result.batchesDone).toBe(2);
    expect(fetched).toEqual(ids.slice(0, 100));
    expect(result.notFetched).toEqual(ids.slice(100));
    expect(calls).toBe(3);
  });

  it("stops everything on a key problem", async () => {
    const api = fakeApi();
    let calls = 0;
    const fetch: FetchLike = async (url, init) =>
      ++calls > 1 ? json(400, googleError(400, "API key not valid. Please pass a valid API key.", { detail: "API_KEY_INVALID", legacy: "badRequest" })) : api.fetch(url, init);
    const run = fetchVideos(Array.from({ length: 500 }, (_, i) => fakeId(i)), { apiKey: "k", fetch, concurrency: 1 });
    await expect(run).rejects.toMatchObject({ name: "YouTubeApiError", reason: "invalid" });
    expect(calls).toBe(2);
  });

  it("can be cancelled", async () => {
    const ctrl = new AbortController();
    const fetch: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    const run = fetchVideos(Array.from({ length: 100 }, (_, i) => fakeId(i)), { apiKey: "k", fetch, signal: ctrl.signal });
    ctrl.abort();
    await expect(run).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("explainApiError", () => {
  it("maps Google's reasons to problems with plain messages", () => {
    const cases: [number, unknown, string][] = [
      [400, googleError(400, "API key not valid.", { detail: "API_KEY_INVALID", legacy: "badRequest" }), "invalid"],
      [400, googleError(400, "Bad Request", { legacy: "keyInvalid" }), "invalid"],
      [403, googleError(403, "YouTube Data API v3 has not been used in project 1 before or it is disabled.", { detail: "SERVICE_DISABLED", legacy: "accessNotConfigured" }), "api-not-enabled"],
      [403, googleError(403, "Access Not Configured.", { legacy: "accessNotConfigured" }), "api-not-enabled"],
      [403, googleError(403, "Requests to this API youtube.googleapis.com method are blocked.", { detail: "API_KEY_SERVICE_BLOCKED" }), "wrong-api"],
      [403, googleError(403, "Requests from referer <empty> are blocked.", { detail: "API_KEY_HTTP_REFERRER_BLOCKED" }), "referrer-blocked"],
      [403, QUOTA, "quota"],
      [404, googleError(404, "Not <b>found</b>", { legacy: "notFound" }), "unknown"],
      [502, "<html>Bad gateway</html>", "unknown"],
    ];
    for (const [status, body, reason] of cases) {
      const explained = explainApiError(status, body);
      expect({ status, reason: explained.reason }).toEqual({ status, reason });
      expect(explained.message).not.toMatch(/[<>]/);
      expect(explained.message.length).toBeGreaterThan(10);
    }
    expect(explainApiError(404, googleError(404, "Not <b>found</b>", {})).message).toContain("Not found");
  });

  it("asks for a key when none was sent", () => {
    expect(explainApiError(403, googleError(403, "Method doesn't allow unregistered callers", {}), false).reason).toBe("invalid");
  });
});

describe("testApiKey", () => {
  it("looks up one known video", async () => {
    const api = fakeApi();
    expect(await testApiKey(" my-key ", { fetch: api.fetch })).toEqual({ ok: true });
    expect(idsOf(api.calls[0].url)).toEqual(["jNQXAC9IVRw"]);
    expect(api.calls[0].headers).toEqual({ "X-Goog-Api-Key": "my-key" });
  });

  it("explains what is wrong", async () => {
    const invalid = await testApiKey("bad", {
      fetch: async () => json(400, googleError(400, "API key not valid.", { detail: "API_KEY_INVALID", legacy: "badRequest" })),
    });
    expect(invalid).toMatchObject({ ok: false, reason: "invalid" });
    const quota = await testApiKey("k", { fetch: async () => json(403, QUOTA) });
    expect(quota).toMatchObject({ ok: false, reason: "quota" });
    expect(quota.ok === false && quota.message).not.toContain("<a");
    const offline = await testApiKey("k", { fetch: () => Promise.reject(new TypeError("offline")), sleep: noSleep });
    expect(offline).toMatchObject({ ok: false, reason: "network" });
  });
});

it("builds the request URL", () => {
  expect(videosUrl(["a", "b"])).toBe(
    "https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=a,b&fields=items(id%2CcontentDetails(duration)%2Csnippet(categoryId%2CliveBroadcastContent))",
  );
  expect(new YouTubeApiError("quota", "x").reason).toBe("quota");
});
