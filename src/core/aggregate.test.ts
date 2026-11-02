import { describe, expect, it } from "vitest";
import { buildDashboard, hours, pyRound, UNAVAILABLE_TITLE } from "./aggregate";
import { estimateEntries, sortByTime } from "./estimate";
import type { EstimatedEntry, VideoInfo } from "./estimate";
import type { WatchEntry } from "./history";
import type { PeriodView } from "./types";

const HOUR_MS = 3600_000;

function watch(localIso: string, videoId: string, channel: [string, string] | null, extra: Partial<WatchEntry> = {}): WatchEntry {
  const localMs = Date.parse(`${localIso}Z`);
  return {
    videoId,
    title: `Title of ${videoId}`,
    channel: channel ? channel[1] : "",
    channelUrl: channel ? `https://www.youtube.com/channel/${channel[0]}` : "",
    music: false,
    utcMs: localMs - HOUR_MS, // CET
    localMs,
    ...extra,
  };
}

function estimate(entries: WatchEntry[], videos: Record<string, [number | null, string | null]>): EstimatedEntry[] {
  const lengths = new Map<string, VideoInfo>(Object.entries(videos).map(([id, [durationSec, categoryId]]) => [id, { durationSec, categoryId }]));
  return estimateEntries(sortByTime(entries), lengths);
}

function heatmap(cells: Record<string, number>): number[][] {
  return Array.from({ length: 7 }, (_, w) => Array.from({ length: 24 }, (_, h) => cells[`${w},${h}`] ?? 0));
}

describe("pyRound", () => {
  it("rounds like Python: exact ties to even, everything else on the exact binary value", () => {
    expect([0.25, 0.75, 1.25, 2.5 / 10, 0.35, 1.15, 0.05].map((x) => pyRound(x, 1))).toEqual([0.2, 0.8, 1.2, 0.2, 0.3, 1.1, 0.1]);
    expect([0.5, 1.5, 2.5, 2.4999, 3.5].map((x) => pyRound(x))).toEqual([0, 2, 2, 2, 4]);
    expect(pyRound(2.675, 2)).toBe(2.67);
    expect(pyRound(0.0625, 3)).toBe(0.062);
    expect(pyRound(0.1875, 3)).toBe(0.188);
    expect(pyRound(-0.25, 1)).toBe(-0.2);
    expect(hours(900)).toBe(0.2);
    expect(hours(2700)).toBe(0.8);
    expect(hours(4230)).toBe(1.2);
  });
});

describe("buildDashboard", () => {
  // Expected values come from the reference aggregate() run on the same entries.
  const ALPHA: [string, string] = ["UCalpha", "Alpha"];
  const entries = estimate(
    [
      watch("2025-12-30T23:30:00", "v1", ALPHA, { title: "Video one" }),
      watch("2025-12-30T23:40:00", "v2", ["UCbeta", "Beta"]),
      watch("2025-12-31T23:50:00", "v3", ALPHA),
      watch("2026-01-01T00:20:00", "v1", ALPHA, { title: "Video one" }),
      watch("2026-01-03T10:00:00", "v4", null),
      watch("2026-01-03T10:05:00", "v5", ["UCgamma", "Gamma"], { music: true }),
      watch("2026-01-03T10:05:30", "v1", ALPHA, { title: "Video one" }),
    ],
    { v1: [600, "20"], v2: [300, "10"], v3: [3000, "20"], v4: [null, null], v5: [45, "10"] },
  );
  const data = buildDashboard(entries);

  it("labels the dashboard and lists years newest first", () => {
    expect(data.label).toBe("Your watch history");
    expect(data.range).toEqual({ first: "2025-12-30", last: "2026-01-03" });
    expect(data.years).toEqual(["2026", "2025"]);
    expect(Object.keys(data.views).sort()).toEqual(["2025", "2026", "all"]);
  });

  it("matches the reference for all time", () => {
    const expected: PeriodView = {
      summary: {
        estimateHours: 1.2, upperBoundHours: 1.4, entries: 7, uniqueVideos: 5,
        channels: 3, // the reference counted the channel-less entry as a channel
        firstDate: "2025-12-30", lastDate: "2026-01-03", days: 5, activeDays: 4, avgMinutesPerDay: 14.1,
        longestBinge: { minutes: 40, date: "2025-12-31", videos: 2 },
        busiestDay: { minutes: 30, date: "2025-12-31" },
        longestStreakDays: 3,
        unavailable: { entries: 1, estimateHours: 0.1 },
        shorts: { entries: 1, estimateHours: 0 },
        youtubeMusic: { entries: 1, estimateHours: 0 },
        nightShare: 0.78, weekendShare: 0.22, peakWeekday: "Wed", peakHour: 23,
      },
      monthly: [
        { m: "2025-12", est: 0.8, ub: 1.1, n: 3 },
        { m: "2026-01", est: 0.4, ub: 0.3, n: 4 },
      ],
      heatmap: heatmap({ "1,23": 0.2, "2,23": 0.5, "3,0": 0.2, "5,10": 0.3 }),
      topChannels: [
        { name: "Alpha", category: "Gaming", hours: 1, videos: 4 },
        { name: "Beta", category: "Music", hours: 0.1, videos: 1 },
        { name: "Gamma", category: "Music", hours: 0, videos: 1 },
      ],
      topVideos: [{ title: "Video one", channel: "Alpha", times: 3, durationSec: 600, hours: 0.5 }],
      categories: [
        { name: "Gaming", hours: 1 },
        { name: "Music", hours: 0.1 },
        { name: "Unknown", hours: 0.1 },
      ],
    };
    expect(data.views.all).toEqual(expected);
  });

  it("matches the reference for each year", () => {
    expect(data.views["2025"].summary).toEqual({
      estimateHours: 0.8, upperBoundHours: 1.1, entries: 3, uniqueVideos: 3, channels: 2,
      firstDate: "2025-12-30", lastDate: "2025-12-31", days: 2, activeDays: 2, avgMinutesPerDay: 22.5,
      // The reference never closed a session still running at the end of a year view and
      // reported 15 minutes on 2025-12-30; the run from 23:50 on New Year's Eve ends there.
      longestBinge: { minutes: 30, date: "2025-12-31", videos: 1 },
      busiestDay: { minutes: 30, date: "2025-12-31" },
      longestStreakDays: 2,
      unavailable: { entries: 0, estimateHours: 0 },
      shorts: { entries: 0, estimateHours: 0 },
      youtubeMusic: { entries: 0, estimateHours: 0 },
      nightShare: 1, weekendShare: 0, peakWeekday: "Wed", peakHour: 23,
    });
    expect(data.views["2025"].topVideos).toEqual([]); // nothing watched twice that year
    expect(data.views["2025"].categories).toEqual([
      { name: "Gaming", hours: 0.7 },
      { name: "Music", hours: 0.1 },
    ]);
    expect(data.views["2026"].summary).toMatchObject({
      estimateHours: 0.4, upperBoundHours: 0.3, entries: 4, uniqueVideos: 3, channels: 2,
      firstDate: "2026-01-01", lastDate: "2026-01-03", days: 3, activeDays: 2, avgMinutesPerDay: 8.5,
      longestBinge: { minutes: 16, date: "2026-01-03", videos: 3 },
      busiestDay: { minutes: 16, date: "2026-01-03" },
      longestStreakDays: 1, nightShare: 0.392, weekendShare: 0.608, peakWeekday: "Sat", peakHour: 10,
    });
    expect(data.views["2026"].topVideos).toEqual([{ title: "Video one", channel: "Alpha", times: 2, durationSec: 600, hours: 0.3 }]);
    expect(data.views["2026"].categories.map((c) => c.name)).toEqual(["Gaming", "Unknown", "Music"]);
  });

  it("groups channels by URL and names them by their newest name", () => {
    const dashboard = buildDashboard(
      estimate(
        [
          watch("2026-03-01T10:00:00", "a1", ["UCsame", "Old Name"]),
          watch("2026-03-01T10:10:00", "a2", ["UCsame", "New Name"]),
          watch("2026-03-01T10:20:00", "b1", ["UCother", "New Name"]),
          watch("2026-03-01T10:30:00", "a3", ["UCsame", "New Name"]),
          watch("2026-03-01T11:30:00", "end", null),
        ],
        { a1: [600, "20"], a2: [600, "10"], a3: [3600, "10"], b1: [60, "20"], end: [60, "20"] },
      ),
    );
    expect(dashboard.views.all.topChannels).toEqual([
      // Music has the most time (600 + 3600 s of 4800), so that is the channel's category.
      { name: "New Name", category: "Music", hours: 1.3, videos: 3 },
      { name: "New Name", category: "Gaming", hours: 0, videos: 1 },
    ]);
    expect(dashboard.views.all.summary.channels).toBe(2);
  });

  it("ranks rewatched videos by times, then hours, and names deleted ones", () => {
    const url = "https://www.youtube.com/watch?v=gone0000001";
    const dashboard = buildDashboard(
      estimate(
        [
          watch("2026-03-01T10:00:00", "twice_long", ["UCa", "A"]),
          watch("2026-03-01T11:00:00", "gone", null, { title: url }),
          watch("2026-03-01T11:05:00", "twice_short", ["UCa", "A"]),
          watch("2026-03-01T11:06:00", "gone", null, { title: url }),
          watch("2026-03-01T11:10:00", "twice_long", ["UCa", "A"], { title: "Renamed later" }),
          watch("2026-03-01T13:00:00", "gone", null, { title: url }),
          watch("2026-03-01T13:01:00", "twice_short", ["UCa", "A"]),
          watch("2026-03-01T14:00:00", "once", ["UCa", "A"]),
        ],
        { twice_long: [1200, "20"], twice_short: [30, "20"], once: [100, "20"], gone: [null, null] },
      ),
    );
    expect(dashboard.views.all.topVideos).toEqual([
      { title: UNAVAILABLE_TITLE, channel: "", times: 3, durationSec: 0, hours: 0.2 },
      { title: "Renamed later", channel: "A", times: 2, durationSec: 1200, hours: 0.7 },
      { title: "Title of twice_short", channel: "A", times: 2, durationSec: 30, hours: 0 },
    ]);
  });

  it("doesn't count picking up a long video where you left off as watching it again", () => {
    const dashboard = buildDashboard(
      estimate(
        [
          watch("2026-03-01T20:00:00", "film", ["UCa", "A"]),
          watch("2026-03-01T21:00:00", "song", ["UCb", "B"]),
          watch("2026-03-02T20:00:00", "film", ["UCa", "A"]), // the second hour of the film
          watch("2026-03-02T21:00:00", "song", ["UCb", "B"]),
        ],
        { film: [7200, "1"], song: [200, "10"] },
      ),
    );
    expect(dashboard.views.all.topVideos).toEqual([{ title: "Title of song", channel: "B", times: 2, durationSec: 200, hours: 0.1 }]);
  });

  it("finds the weekday and the hour with the most watch time, each on its own", () => {
    // Each week: a 90-minute video late on Saturday (the busiest single slot), three hours on
    // Sunday afternoon, and 20 minutes at 1 pm on weekdays.
    const entries: WatchEntry[] = [];
    const videos: Record<string, [number, string]> = {};
    const add = (day: number, time: string, id: string, sec: number) => {
      entries.push(watch(`${new Date(Date.UTC(2026, 0, day)).toISOString().slice(0, 10)}T${time}`, id, ["UCa", "A"]));
      videos[id] = [sec, "20"];
    };
    for (let week = 0; week < 4; week++) {
      const sat = 3 + 7 * week; // 3 January 2026 was a Saturday
      add(sat, "23:00:00", `late${week}`, 5400);
      for (const h of [13, 14, 15]) add(sat + 1, `${h}:00:00`, `sun${week}${h}`, 3600);
      for (let d = 2; d <= 6; d++) add(sat + d, "13:00:00", `day${week}${d}`, 1200);
    }
    const view = buildDashboard(estimate(entries, videos)).views.all;
    expect(view.heatmap[5][23]).toBe(Math.max(...view.heatmap.flat()));
    expect(view.summary).toMatchObject({ peakWeekday: "Sun", peakHour: 13 });
  });

  it("refuses an empty history", () => {
    expect(() => buildDashboard([])).toThrow(RangeError);
  });
});

describe("aggregate invariants", () => {
  // A deterministic pseudo-random history spanning three calendar years.
  let seed = 42;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const entries: WatchEntry[] = [];
  const videos: Record<string, [number | null, string | null]> = {};
  let t = Date.UTC(2024, 11, 20, 18);
  for (let i = 0; i < 3000; i++) {
    t += Math.floor(rand() < 0.1 ? rand() * 2 * 86400_000 : rand() * 1800_000);
    const id = `vid${String(Math.floor(rand() * 900)).padStart(8, "0")}`;
    if (!(id in videos)) {
      const r = rand();
      videos[id] = r < 0.05 ? [null, null] : [r < 0.3 ? 20 + Math.floor(rand() * 40) : 60 + Math.floor(rand() * 4000), ["10", "20", "22", "24", "27", "28", "1", "2", "15", "17"][Math.floor(rand() * 10)]];
    }
    const ch = Math.floor(rand() * 30);
    entries.push(watch(new Date(t).toISOString().slice(0, 19), id, rand() < 0.03 ? null : [`UC${ch}`, `Channel ${ch}`], { music: rand() < 0.05 }));
  }
  const data = buildDashboard(estimate(entries, videos));
  const all = data.views.all;
  const near = (a: number, b: number, slack: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(slack);

  it("splits all time into calendar years", () => {
    expect(data.years).toEqual(["2027", "2026", "2025", "2024"].filter((y) => y in data.views));
    expect(data.years.reduce((n, y) => n + data.views[y].summary.entries, 0)).toBe(all.summary.entries);
    near(data.years.reduce((h, y) => h + data.views[y].summary.estimateHours, 0), all.summary.estimateHours, 0.05 * data.years.length);
    const oldest = data.views[data.years[data.years.length - 1]].summary;
    const newest = data.views[data.years[0]].summary;
    expect(oldest.firstDate).toBe(all.summary.firstDate);
    expect(newest.lastDate).toBe(all.summary.lastDate);
    for (const y of data.years.slice(1, -1)) {
      expect([data.views[y].summary.firstDate, data.views[y].summary.lastDate]).toEqual([`${y}-01-01`, `${y}-12-31`]);
    }
  });

  it("keeps monthly, heatmap and category totals consistent", () => {
    for (const view of Object.values(data.views)) {
      const s = view.summary;
      expect(view.monthly.reduce((n, m) => n + m.n, 0)).toBe(s.entries);
      near(view.monthly.reduce((h, m) => h + m.est, 0), s.estimateHours, 0.05 * view.monthly.length + 0.05);
      near(view.heatmap.flat().reduce((a, b) => a + b, 0), s.estimateHours, 0.05 * 168);
      near(view.categories.reduce((h, c) => h + c.hours, 0), s.estimateHours, 0.05 * view.categories.length + 0.05);
      expect(view.heatmap).toHaveLength(7);
      expect(view.heatmap.every((row) => row.length === 24)).toBe(true);
      expect(view.monthly.map((m) => m.m)).toEqual([...view.monthly.map((m) => m.m)].sort());
    }
  });

  it("sorts and limits the top lists", () => {
    for (const view of Object.values(data.views)) {
      expect(view.topChannels.length).toBeLessThanOrEqual(8);
      expect(view.topChannels.map((c) => c.hours)).toEqual([...view.topChannels.map((c) => c.hours)].sort((a, b) => b - a));
      expect(view.topVideos.length).toBeLessThanOrEqual(6);
      expect(view.topVideos.every((v) => v.times >= 2)).toBe(true);
      expect(view.topVideos.map((v) => v.times)).toEqual([...view.topVideos.map((v) => v.times)].sort((a, b) => b - a));
      expect(view.categories.length).toBeLessThanOrEqual(9);
      const named = view.categories.filter((c) => c.name !== "Other").map((c) => c.hours);
      expect(named).toEqual([...named].sort((a, b) => b - a));
    }
    expect(all.categories[8]?.name).toBe("Other");
  });

  it("keeps the summary within its bounds", () => {
    for (const view of Object.values(data.views)) {
      const s = view.summary;
      expect(s.activeDays).toBeLessThanOrEqual(s.days);
      expect(s.longestStreakDays).toBeLessThanOrEqual(s.activeDays);
      expect(s.busiestDay.minutes).toBeLessThanOrEqual(24 * 60 + 10);
      expect(s.nightShare).toBeGreaterThanOrEqual(0);
      expect(s.nightShare).toBeLessThanOrEqual(1);
      expect(s.weekendShare).toBeLessThanOrEqual(1);
      expect(s.uniqueVideos).toBeLessThanOrEqual(s.entries);
      expect(s.unavailable.entries + s.shorts.entries).toBeLessThanOrEqual(s.entries);
      // Unknown lengths add to the estimate but not to the upper bound.
      expect(s.estimateHours - s.unavailable.estimateHours).toBeLessThanOrEqual(s.upperBoundHours + 0.1);
      near(s.avgMinutesPerDay, (s.estimateHours * 60) / s.days, 0.1 * 60 / s.days + 0.05);
    }
  });
});
