import { describe, expect, it } from "vitest";
import { estimateEntries, sortByTime } from "./estimate";
import type { VideoInfo } from "./estimate";
import type { WatchEntry } from "./history";

const T0 = Date.UTC(2026, 0, 5, 20); // a Monday, 20:00
const DAY = 86400;

function at(videoId: string, seconds: number): WatchEntry {
  const ms = T0 + seconds * 1000;
  return { videoId, title: videoId, channel: "Channel", channelUrl: "https://www.youtube.com/channel/UCx", music: false, utcMs: ms, localMs: ms + 3600_000 };
}

function lengths(map: Record<string, number | null>, categoryId = "20"): Map<string, VideoInfo> {
  return new Map(Object.entries(map).map(([id, durationSec]) => [id, { durationSec, categoryId: durationSec === null ? null : categoryId }]));
}

const pick = (entries: ReturnType<typeof estimateEntries>) => entries.map((e) => [e.est, e.ub]);

describe("estimateEntries", () => {
  it("counts each video until the next entry, never longer than the video", () => {
    const entries = [at("a", 0), at("b", 300), at("c", 2000)];
    const out = estimateEntries(entries, lengths({ a: 600, b: 1200, c: 100 }));
    expect(pick(out)).toEqual([
      [300, 600],
      [1200, 1200],
      [100, 100], // the last entry counts in full
    ]);
    expect(out.map((e) => e.gapSec)).toEqual([300, 1700, null]);
    expect(out[0]).toMatchObject({ durationSec: 600, category: "Gaming", videoId: "a" });
  });

  it("counts unknown lengths until the next entry, at most 10 minutes (5 for the last)", () => {
    const entries = [at("x", 0), at("y", 120), at("z", 5000)];
    const out = estimateEntries(entries, lengths({ x: null, y: null }));
    expect(pick(out)).toEqual([
      [120, 0],
      [600, 0],
      [300, 0], // z isn't known at all
    ]);
    expect(out.map((e) => e.category)).toEqual(["Unknown", "Unknown", "Unknown"]);
  });

  it("treats a long video seen again within a week as a resume", () => {
    const entries = [at("long", 0), at("other", 2400), at("long", DAY), at("other", DAY + 10_000), at("long", 2 * DAY), at("end", 3 * DAY)];
    const out = estimateEntries(entries, lengths({ long: 7200, other: 60, end: 60 }));
    expect(pick(out)).toEqual([
      [2400, 7200], // 40 minutes of 2 hours
      [60, 60],
      [4800, 0], // the rest of it; its length already counted
      [60, 60],
      [7200, 7200], // watched to the end before, so this is a rewatch
      [60, 60],
    ]);
  });

  it("counts at most 12 hours of a video in the upper bound", () => {
    // A month-long recording of a 24/7 stream, opened for half an hour.
    const entries = [at("stream", 0), at("x", 1800), at("x", 1900)];
    expect(pick(estimateEntries(entries, lengths({ stream: 30 * DAY, x: 100 })))).toEqual([
      [1800, 12 * 3600],
      [100, 100],
      [100, 100],
    ]);
  });

  it("does not resume after a week, or short videos", () => {
    const later = [at("long", 0), at("x", 600), at("long", 8 * DAY), at("x", 8 * DAY + 600)];
    expect(pick(estimateEntries(later, lengths({ long: 7200, x: 60 })))).toEqual([
      [600, 7200],
      [60, 60],
      [600, 7200],
      [60, 60],
    ]);
    const short = [at("s", 0), at("x", 600), at("s", 3600), at("x", 4200)];
    expect(pick(estimateEntries(short, lengths({ s: 1700, x: 60 })))).toEqual([
      [600, 1700],
      [60, 60],
      [600, 1700],
      [60, 60],
    ]);
  });

  it("does not resume a video already counted to 95%", () => {
    const entries = [at("long", 0), at("x", 3500), at("long", 4000), at("x", 4600)];
    // 3500 s of 3600 counted (97%): the next viewing is a rewatch.
    expect(pick(estimateEntries(entries, lengths({ long: 3600, x: 60 })))).toEqual([
      [3500, 3600],
      [60, 60],
      [600, 3600],
      [60, 60],
    ]);
  });
});

describe("sortByTime", () => {
  it("sorts oldest first and keeps the file order of entries with the same time", () => {
    const sorted = sortByTime([at("c", 10), at("a", 5), at("b1", 7), at("b2", 7), at("b3", 7)]);
    expect(sorted.map((e) => e.videoId)).toEqual(["a", "b1", "b2", "b3", "c"]);
  });
});
