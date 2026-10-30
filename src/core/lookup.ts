import type { CachedVideo, VideoStore } from "./cache";
import { AnalysisError } from "./errors";
import type { VideoInfo } from "./estimate";
import type { Progress } from "./types";
import { BATCH_SIZE, fetchVideos, YouTubeApiError } from "./youtubeApi";
import type { FetchLike } from "./youtubeApi";

export interface LookupOptions {
  apiKey: string;
  store: VideoStore;
  fetch?: FetchLike;
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
  /** For cache expiry; defaults to Date.now(). */
  now?: number;
  onProgress?: (p: Progress) => void;
}

export interface LookupResult {
  videos: Map<string, VideoInfo>;
  /** Unique video IDs asked for. */
  total: number;
  fromCache: number;
  fetched: number;
  /** Deleted or private: not returned by the API. */
  missing: number;
  /** Returned without a length: live or upcoming streams. */
  noLength: number;
  /** The daily quota ran out before every video was looked up. */
  quotaExceeded: boolean;
  /** Left unknown because the quota ran out. */
  notLookedUp: number;
}

/** Video lengths from the cache, then from the API for the rest (saving each batch as it arrives). */
export async function lookupVideos(ids: readonly string[], opts: LookupOptions): Promise<LookupResult> {
  const now = opts.now ?? Date.now();
  let cached: Map<string, CachedVideo>;
  try {
    cached = await opts.store.load(now);
  } catch {
    cached = new Map(); // a broken cache only costs lookups
  }
  const videos = new Map<string, VideoInfo>();
  let missing = 0;
  let noLength = 0;
  const note = (v: Omit<CachedVideo, "fetchedAt">) => {
    videos.set(v.id, { durationSec: v.durationSec, categoryId: v.categoryId });
    if (v.missing) missing++;
    else if (v.durationSec === null) noLength++;
  };
  const todo: string[] = [];
  for (const id of ids) {
    const hit = cached.get(id);
    if (hit) note(hit);
    else todo.push(id);
  }
  const fromCache = ids.length - todo.length;
  const batches = Math.ceil(todo.length / BATCH_SIZE);
  const count = (n: number) => n.toLocaleString("en-US");
  const detail = fromCache
    ? `${count(todo.length)} videos to look up, ${count(fromCache)} saved from earlier runs`
    : `${count(todo.length)} videos to look up`;
  opts.onProgress?.({ stage: "lookup", done: 0, total: batches, detail });
  let quotaExceeded = false;
  let notLookedUp = 0;
  if (todo.length) {
    try {
      const result = await fetchVideos(todo, {
        apiKey: opts.apiKey,
        fetch: opts.fetch,
        signal: opts.signal,
        sleep: opts.sleep,
        onBatch: async (batch, done) => {
          for (const v of batch) note(v);
          try {
            await opts.store.save(batch.map((v) => ({ ...v, fetchedAt: now })));
          } catch {
            // Not saved: these get looked up again next time.
          }
          opts.onProgress?.({ stage: "lookup", done, total: batches, detail });
        },
      });
      quotaExceeded = result.quotaExceeded;
      notLookedUp = result.notFetched.length;
    } catch (err) {
      if (err instanceof YouTubeApiError) throw new AnalysisError(err.reason, err.message);
      throw err;
    }
  }
  return {
    videos,
    total: ids.length,
    fromCache,
    fetched: todo.length - notLookedUp,
    missing,
    noLength,
    quotaExceeded,
    notLookedUp,
  };
}
