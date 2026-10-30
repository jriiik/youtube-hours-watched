import { abortError } from "./errors";
import type { ApiKeyCheck, ApiKeyProblem } from "./types";

// YouTube Data API v3, videos.list: up to 50 IDs per call, 1 quota unit per call.
const VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";
const FIELDS = "items(id,contentDetails(duration),snippet(categoryId,liveBroadcastContent))";
export const BATCH_SIZE = 50;
export const CONCURRENCY = 6;
const RETRIES = 4;
const REQUEST_TIMEOUT_MS = 30_000;
/** "Me at the zoo", the first video on YouTube: always there, so a cheap key check. */
const TEST_VIDEO_ID = "jNQXAC9IVRw";

const CATEGORIES: Record<string, string> = {
  "1": "Film & Animation", "2": "Autos & Vehicles", "10": "Music", "15": "Pets & Animals",
  "17": "Sports", "19": "Travel & Events", "20": "Gaming", "22": "People & Blogs",
  "23": "Comedy", "24": "Entertainment", "25": "News & Politics", "26": "Howto & Style",
  "27": "Education", "28": "Science & Technology", "29": "Nonprofits & Activism",
};

export function categoryName(id: string | null | undefined): string {
  return (id && CATEGORIES[id]) || "Unknown";
}

/**
 * Seconds in an ISO 8601 duration (P#DT#H#M#S, every part optional). Zero, missing or malformed
 * durations are null: YouTube reports P0D for live and upcoming streams.
 */
export function parseIsoDuration(value: string | null | undefined): number | null {
  const m = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(value ?? "");
  if (!m) return null;
  const [w, d, h, mi, s] = m.slice(1).map((x) => (x ? Number(x) : 0));
  const total = Math.round(w * 604800 + d * 86400 + h * 3600 + mi * 60 + s);
  return total > 0 ? total : null;
}

export interface FetchedVideo {
  id: string;
  durationSec: number | null;
  categoryId: string | null;
  /** liveBroadcastContent: "none", "live" or "upcoming"; null when missing. */
  live: string | null;
  /** Not in the reply: deleted or private. */
  missing: boolean;
}

export type FetchLike = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<Response>;

export interface ApiOptions {
  /** "" sends no key header (the cloud dev sandbox's proxy adds one). */
  apiKey: string;
  fetch?: FetchLike;
  signal?: AbortSignal;
  /** Waits between retries; replaceable in tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Retries after network errors, 5xx and rate limits (default 4: waits 1, 2, 4, 8 s). */
  retries?: number;
}

/** A failed lookup, with a plain-language message. */
export class YouTubeApiError extends Error {
  readonly reason: ApiKeyProblem;
  readonly status: number | null;

  constructor(reason: ApiKeyProblem, message: string, status: number | null = null) {
    super(message);
    this.name = "YouTubeApiError";
    this.reason = reason;
    this.status = status;
  }
}

const MESSAGES: Record<Exclude<ApiKeyProblem, "unknown">, string> = {
  invalid: "Google doesn't recognise this API key. Check that you copied all of it.",
  "api-not-enabled":
    "The YouTube Data API v3 isn't turned on for this key's Google Cloud project. Enable it in the Google Cloud console, wait a minute, then try again.",
  "wrong-api":
    "This key isn't allowed to use the YouTube Data API v3. In the Google Cloud console, add YouTube Data API v3 to the key's API restrictions.",
  "referrer-blocked":
    "This key only works on certain websites, so this app can't use it. In the Google Cloud console, set the key's application restriction to None.",
  quota: "This key has used up today's YouTube API quota. It resets at midnight Pacific Time.",
  network: "Couldn't reach YouTube. Check your internet connection and try again.",
};

interface GoogleErrorBody {
  error?: {
    code?: number;
    message?: string;
    errors?: { reason?: string; message?: string }[];
    details?: { reason?: string }[];
  };
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

/** Maps a Google API error reply to a reason and a plain-language message. */
export function explainApiError(status: number, body: unknown, hasKey = true): { reason: ApiKeyProblem; message: string } {
  const err = (body && typeof body === "object" ? (body as GoogleErrorBody).error : undefined) ?? {};
  const reasons = new Set<string>();
  for (const d of err.details ?? []) if (d?.reason) reasons.add(d.reason);
  for (const e of err.errors ?? []) if (e?.reason) reasons.add(e.reason);
  const has = (...names: string[]) => names.some((n) => reasons.has(n));
  let reason: ApiKeyProblem = "unknown";
  if (has("API_KEY_INVALID", "keyInvalid")) reason = "invalid";
  else if (has("SERVICE_DISABLED", "accessNotConfigured")) reason = "api-not-enabled";
  else if (has("API_KEY_SERVICE_BLOCKED")) reason = "wrong-api";
  else if (has("API_KEY_HTTP_REFERRER_BLOCKED")) reason = "referrer-blocked";
  else if (has("quotaExceeded", "dailyLimitExceeded")) reason = "quota";
  if (reason !== "unknown") return { reason, message: MESSAGES[reason] };
  if (!hasKey && (status === 401 || status === 403)) {
    return { reason: "invalid", message: "YouTube needs an API key. Add yours in the settings." };
  }
  const detail = stripHtml(err.message ?? "");
  return {
    reason: "unknown",
    message: `YouTube refused the lookup (HTTP ${status})${detail ? `: ${detail}` : "."}`,
  };
}

function isTransient(status: number, body: unknown): boolean {
  if (status >= 500 || status === 429) return true;
  const errors = (body as GoogleErrorBody | null)?.error?.errors ?? [];
  return status === 403 && errors.some((e) => e?.reason === "rateLimitExceeded" || e?.reason === "userRateLimitExceeded");
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function videosUrl(ids: readonly string[]): string {
  return `${VIDEOS_URL}?part=contentDetails,snippet&id=${ids.join(",")}&fields=${encodeURIComponent(FIELDS)}`;
}

/** One GET with a timeout; network failures and timeouts reject with YouTubeApiError("network"). */
async function getOnce(url: string, opts: ApiOptions): Promise<{ status: number; body: unknown }> {
  const fetchImpl: FetchLike = opts.fetch ?? ((u, init) => fetch(u, init));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  opts.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const headers: Record<string, string> = opts.apiKey ? { "X-Goog-Api-Key": opts.apiKey } : {};
    const res = await fetchImpl(url, { headers, signal: ctrl.signal });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status: res.status, body };
  } catch {
    if (opts.signal?.aborted) throw abortError(opts.signal);
    throw new YouTubeApiError("network", MESSAGES.network);
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  }
}

/** GET with retries (backoff 1, 2, 4, 8 s by default) for network errors, 5xx, 429 and rate limits. */
async function getJson(url: string, opts: ApiOptions): Promise<unknown> {
  const sleep = opts.sleep ?? defaultSleep;
  for (let attempt = 0; ; attempt++) {
    let failure: YouTubeApiError;
    try {
      const { status, body } = await getOnce(url, opts);
      if (status >= 200 && status < 300 && body && typeof body === "object") return body;
      if (status >= 200 && status < 300) {
        failure = new YouTubeApiError("unknown", "YouTube sent a reply this app couldn't read.", status);
      } else if (isTransient(status, body)) {
        failure = new YouTubeApiError("unknown", `YouTube's servers kept failing (HTTP ${status}). Try again later.`, status);
      } else {
        const { reason, message } = explainApiError(status, body, opts.apiKey !== "");
        throw new YouTubeApiError(reason, message, status);
      }
    } catch (err) {
      if (!(err instanceof YouTubeApiError) || err.reason !== "network") throw err;
      failure = err;
    }
    if (attempt >= (opts.retries ?? RETRIES)) throw failure;
    await sleep(1000 * 2 ** attempt);
    if (opts.signal?.aborted) throw abortError(opts.signal);
  }
}

interface VideoItem {
  id?: string;
  contentDetails?: { duration?: string };
  snippet?: { categoryId?: string; liveBroadcastContent?: string };
}

/** Looks up one batch of at most 50 IDs. IDs missing from the reply are deleted or private. */
export async function fetchVideoBatch(ids: readonly string[], opts: ApiOptions): Promise<FetchedVideo[]> {
  if (ids.length > BATCH_SIZE) throw new RangeError(`At most ${BATCH_SIZE} IDs per request`);
  const body = (await getJson(videosUrl(ids), opts)) as { items?: VideoItem[] };
  const found = new Map<string, VideoItem>();
  for (const item of body.items ?? []) if (item?.id) found.set(item.id, item);
  return ids.map((id) => {
    const item = found.get(id);
    if (!item) return { id, durationSec: null, categoryId: null, live: null, missing: true };
    return {
      id,
      durationSec: parseIsoDuration(item.contentDetails?.duration),
      categoryId: item.snippet?.categoryId ?? null,
      live: item.snippet?.liveBroadcastContent ?? null,
      missing: false,
    };
  });
}

export interface FetchVideosResult {
  /** Batches that were looked up. */
  batchesDone: number;
  /** The daily quota ran out; the IDs in `notFetched` are left unknown. */
  quotaExceeded: boolean;
  notFetched: string[];
}

/**
 * Looks up many IDs, about six requests at a time. Each finished batch goes to onBatch (so it
 * can be cached right away). Key problems stop everything with a YouTubeApiError; running out
 * of quota stops new requests and returns what was fetched.
 */
export async function fetchVideos(
  ids: readonly string[],
  opts: ApiOptions & {
    concurrency?: number;
    onBatch?: (videos: FetchedVideo[], done: number, total: number) => void | Promise<void>;
  },
): Promise<FetchVideosResult> {
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) batches.push(ids.slice(i, i + BATCH_SIZE));
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort(opts.signal?.reason);
  opts.signal?.addEventListener("abort", onAbort, { once: true });
  const inner: ApiOptions = { ...opts, signal: ctrl.signal };
  const fetched = new Set<number>();
  let next = 0;
  let quotaExceeded = false;
  let fatal: unknown = null;

  const run = async () => {
    while (!quotaExceeded && fatal === null && next < batches.length) {
      const index = next++;
      try {
        const videos = await fetchVideoBatch(batches[index], inner);
        fetched.add(index);
        await opts.onBatch?.(videos, fetched.size, batches.length);
      } catch (err) {
        if (err instanceof YouTubeApiError && err.reason === "quota") quotaExceeded = true;
        else if (fatal === null) {
          fatal = err;
          ctrl.abort();
        }
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? CONCURRENCY, batches.length) }, run));
  } finally {
    opts.signal?.removeEventListener("abort", onAbort);
  }
  if (opts.signal?.aborted) throw abortError(opts.signal);
  if (fatal !== null) throw fatal;
  const notFetched = batches.flatMap((batch, i) => (fetched.has(i) ? [] : batch));
  return { batchesDone: fetched.size, quotaExceeded, notFetched };
}

/** Makes one cheap lookup to tell whether the key works (retrying once, so offline is reported quickly). */
export async function testApiKey(apiKey: string, opts: Omit<ApiOptions, "apiKey"> = {}): Promise<ApiKeyCheck> {
  try {
    await fetchVideoBatch([TEST_VIDEO_ID], { retries: 1, ...opts, apiKey: apiKey.trim() });
    return { ok: true };
  } catch (err) {
    if (err instanceof YouTubeApiError) return { ok: false, reason: err.reason, message: err.message };
    if (opts.signal?.aborted) throw err;
    return { ok: false, reason: "unknown", message: err instanceof Error ? err.message : String(err) };
  }
}
