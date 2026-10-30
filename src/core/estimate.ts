import type { WatchEntry } from "./history";
import { categoryName } from "./youtubeApi";

/** What the lookup knows about a video. durationSec null = unknown (deleted, private, live). */
export interface VideoInfo {
  durationSec: number | null;
  categoryId: string | null;
}

export interface EstimatedEntry extends WatchEntry {
  durationSec: number | null;
  category: string;
  /** Seconds until the next entry; null for the last one. */
  gapSec: number | null;
  /** Estimated seconds watched. */
  est: number;
  /** Upper-bound seconds (the full length up to 12 hours, counted once per resumed viewing). */
  ub: number;
}

/** Unknown lengths count until the next entry, at most 10 minutes (5 for the very last entry). */
export const UNKNOWN_LAST_SEC = 300;
export const UNKNOWN_MAX_SEC = 600;
/**
 * A long video seen again within a week, with less than 95% of it counted so far, is a resume
 * rather than a rewatch: only the part not yet counted can count, and its full length counts
 * once in the upper bound.
 */
export const RESUME_MIN_SEC = 1800;
export const RESUME_WINDOW_MS = 7 * 24 * 3600 * 1000;
export const RESUME_DONE_SHARE = 0.95;
/**
 * In the upper bound a video counts at most 12 hours: longer ones are recordings of
 * round-the-clock live streams, some of them weeks long, which nobody watches to the end.
 */
export const UB_MAX_SEC = 12 * 3600;

/** Oldest first. The sort is stable, so entries with the same time keep their file order. */
export function sortByTime<T extends WatchEntry>(entries: readonly T[]): T[] {
  return entries.slice().sort((a, b) => a.utcMs - b.utcMs);
}

/** Per-entry estimate. `sorted` must be oldest first (see sortByTime). */
export function estimateEntries(sorted: readonly WatchEntry[], videos: ReadonlyMap<string, VideoInfo>): EstimatedEntry[] {
  const progress = new Map<string, { lastMs: number; counted: number }>();
  const out: EstimatedEntry[] = new Array(sorted.length);
  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i];
    const info = videos.get(e.videoId);
    const dur = info?.durationSec ?? null;
    const gap = i + 1 < sorted.length ? (sorted[i + 1].utcMs - e.utcMs) / 1000 : null;
    const category = categoryName(info?.categoryId);
    if (dur === null) {
      out[i] = { ...e, durationSec: null, category, gapSec: gap, est: Math.min(gap ?? UNKNOWN_LAST_SEC, UNKNOWN_MAX_SEC), ub: 0 };
      continue;
    }
    let cap = dur;
    let ub = Math.min(dur, UB_MAX_SEC);
    let done = 0;
    const prev = dur >= RESUME_MIN_SEC ? progress.get(e.videoId) : undefined;
    if (prev && e.utcMs - prev.lastMs <= RESUME_WINDOW_MS && prev.counted < RESUME_DONE_SHARE * dur) {
      done = prev.counted;
      cap = dur - done;
      ub = 0;
    }
    const est = gap === null ? cap : Math.min(cap, gap);
    if (dur >= RESUME_MIN_SEC) progress.set(e.videoId, { lastMs: e.utcMs, counted: done + est });
    out[i] = { ...e, durationSec: dur, category, gapSec: gap, est, ub };
  }
  return out;
}
