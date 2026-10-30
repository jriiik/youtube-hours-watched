import { describe, expect, it } from "vitest";
import { buildDashboard } from "./aggregate";
import { memoryVideoStore } from "./cache";
import type { CachedVideo } from "./cache";
import { estimateEntries, historyInTimeOrder } from "./estimate";
import type { EstimatedEntry, VideoInfo } from "./estimate";
import type { ParsedHistory } from "./history";
import { parseHtmlHistory } from "./parseHtml";
import { runAnalysis } from "./pipeline";
import type { DashboardData } from "./types";

// Checks the analysis against the reference implementation's results for a real watch
// history. It runs only where REAL_HISTORY (a watch-history.html) and REAL_DERIVED (a folder
// with the reference's videos.json, summary.json and optionally entries.jsonl) are set, and
// its assertions report numbers only: never titles, channel names or video IDs.

interface NodeFs {
  readFileSync(path: string, encoding: "utf8"): string;
  existsSync(path: string): boolean;
  openAsBlob(path: string): Promise<Blob>;
}

interface ReferenceSummary {
  watchedEntries: number;
  uniqueVideos: number;
  firstLocal: string;
  lastLocal: string;
  days: number;
  estimateHours: number;
  upperBoundHours: number;
  avgMinutesPerDay: number;
  unknownLength: { entries: number; estimateHours: number };
  upTo60s: { entries: number; estimateHours: number };
  youtubeMusicEntries: number;
  byYear: Record<string, { estimateHours: number; upperBoundHours: number; entries: number }>;
  topChannels: [string, number, number][];
  categories: [string, number][];
  skipped: Record<string, number>;
}

interface ReferenceEntry {
  id: string;
  when: string;
  local: string;
  dur: number | null;
  gap: number | null;
  est: number;
  ub: number;
  channel: string | null;
  cat: string;
  music: boolean;
}

type ReferenceVideo = { sec: number | null; cat?: string | null; live?: string | null; missing?: boolean };

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const historyPath = env.REAL_HISTORY ?? "";
const derivedDir = env.REAL_DERIVED ?? "";
const TOLERANCE_H = 0.2;

async function nodeFs(): Promise<NodeFs> {
  const id = "node:fs"; // a variable, not a literal: the project only has browser types
  return (await import(/* @vite-ignore */ id)) as NodeFs;
}

function near(actual: number, expected: number, what: string) {
  expect({ what, diff: Math.abs(actual - expected) <= TOLERANCE_H ? 0 : actual - expected }).toEqual({ what, diff: 0 });
}

describe.skipIf(!historyPath || !derivedDir)("real watch history (local check)", () => {
  let ref: ReferenceSummary;
  let records: CachedVideo[];
  let parsed: ParsedHistory;
  let estimated: EstimatedEntry[];
  let data: DashboardData;

  it("parses the history quickly and skips the same items as the reference", async () => {
    const fs = await nodeFs();
    ref = JSON.parse(fs.readFileSync(`${derivedDir}/summary.json`, "utf8")) as ReferenceSummary;
    const videos = JSON.parse(fs.readFileSync(`${derivedDir}/videos.json`, "utf8")) as Record<string, ReferenceVideo>;
    const now = Date.now();
    records = Object.entries(videos).map(([id, v]) => ({
      id,
      durationSec: v.sec ?? null,
      categoryId: v.cat ?? null,
      live: v.live ?? null,
      fetchedAt: now,
      missing: v.missing === true,
    }));
    const text = fs.readFileSync(historyPath, "utf8");
    const t0 = performance.now();
    parsed = parseHtmlHistory(text);
    const ms = performance.now() - t0;
    console.log(`parse: ${parsed.items} items, ${(text.length / 1e6).toFixed(1)}M characters in ${ms.toFixed(0)} ms`);

    const notWatched = Object.entries(ref.skipped)
      .filter(([k]) => k.startsWith("not a watched video"))
      .reduce((sum, [, n]) => sum + n, 0);
    expect(parsed.entries.length).toBe(ref.watchedEntries);
    expect(parsed.skipped.ads).toBe(ref.skipped.ad ?? 0);
    expect(parsed.skipped.posts + parsed.skipped.other).toBe(notWatched);
    expect(parsed.skipped.unparsedDates).toBe(ref.skipped["unparsed date"] ?? 0);
    expect(Object.keys(parsed.unknownZones)).toEqual([]);
    expect(ms).toBeLessThan(5000);
  }, 60_000);

  it("gives every entry exactly the reference's estimate", async () => {
    const fs = await nodeFs();
    const lengths = new Map<string, VideoInfo>(records.map((r) => [r.id, { durationSec: r.durationSec, categoryId: r.categoryId }]));
    estimated = estimateEntries(historyInTimeOrder(parsed.entries), lengths);
    const path = `${derivedDir}/entries.jsonl`;
    if (!fs.existsSync(path)) return;
    const lines = fs.readFileSync(path, "utf8").split("\n").filter(Boolean);
    expect(estimated.length).toBe(lines.length);
    const mismatch = { values: 0, times: 0, channels: 0, firstAt: -1 };
    lines.forEach((line, i) => {
      const r = JSON.parse(line) as ReferenceEntry;
      const e = estimated[i];
      const values =
        e.videoId !== r.id || e.est !== r.est || e.ub !== r.ub || e.durationSec !== r.dur ||
        e.gapSec !== r.gap || e.category !== r.cat || e.music !== r.music;
      const times = e.utcMs !== Date.parse(r.when) || e.localMs !== Date.parse(`${r.local}Z`);
      const channels = e.channel !== (r.channel ?? "").replace(/\u00a0/g, " ").trim();
      if (values) mismatch.values++;
      if (times) mismatch.times++;
      if (channels) mismatch.channels++;
      if ((values || times || channels) && mismatch.firstAt < 0) mismatch.firstAt = i;
    });
    expect(mismatch).toEqual({ values: 0, times: 0, channels: 0, firstAt: -1 });
  }, 60_000);

  it("matches the reference summary", () => {
    data = buildDashboard(estimated);
    const all = data.views.all.summary;
    expect(data.label).toBe("Your watch history");
    expect(all.entries).toBe(ref.watchedEntries);
    expect(all.uniqueVideos).toBe(ref.uniqueVideos);
    expect(all.firstDate).toBe(ref.firstLocal.slice(0, 10));
    expect(all.lastDate).toBe(ref.lastLocal.slice(0, 10));
    expect(data.range).toEqual({ first: all.firstDate, last: all.lastDate });
    expect(all.days).toBe(ref.days);
    near(all.estimateHours, ref.estimateHours, "estimateHours");
    near(all.upperBoundHours, ref.upperBoundHours, "upperBoundHours");
    near(all.avgMinutesPerDay, ref.avgMinutesPerDay, "avgMinutesPerDay");
    expect(all.unavailable.entries).toBe(ref.unknownLength.entries);
    near(all.unavailable.estimateHours, ref.unknownLength.estimateHours, "unknownLength hours");
    expect(all.shorts.entries).toBe(ref.upTo60s.entries);
    near(all.shorts.estimateHours, ref.upTo60s.estimateHours, "upTo60s hours");
    expect(all.youtubeMusic.entries).toBe(ref.youtubeMusicEntries);

    expect(data.years).toEqual(Object.keys(ref.byYear).sort().reverse());
    for (const [year, y] of Object.entries(ref.byYear)) {
      const s = data.views[year].summary;
      expect({ year, entries: s.entries }).toEqual({ year, entries: y.entries });
      near(s.estimateHours, y.estimateHours, `${year} estimateHours`);
      near(s.upperBoundHours, y.upperBoundHours, `${year} upperBoundHours`);
    }

    const cats = data.views.all.categories;
    const top = ref.categories.slice(0, 8);
    expect(cats.slice(0, 8).map((c) => c.name)).toEqual(top.map(([name]) => name));
    cats.slice(0, 8).forEach((c, i) => near(c.hours, top[i][1], `category #${i + 1}`));
    const rest = ref.categories.slice(8).reduce((sum, [, h]) => sum + h, 0);
    expect(cats[8]?.name).toBe("Other");
    expect(Math.abs((cats[8]?.hours ?? 0) - rest)).toBeLessThanOrEqual(0.5); // a sum of rounded values

    // The reference grouped channels by untrimmed name; here they are grouped by URL, so only
    // check loosely: most of the top channels are the same and none has fewer hours.
    const refByName = new Map<string, number>();
    for (const [name, h] of ref.topChannels) refByName.set(name.trim(), Math.max(h, refByName.get(name.trim()) ?? 0));
    const channels = data.views.all.topChannels.map((c, rank) => ({ rank, hours: c.hours, ref: refByName.get(c.name) ?? null }));
    expect(channels.filter((c) => c.ref !== null).length).toBeGreaterThanOrEqual(6);
    expect(channels.filter((c) => c.ref !== null && c.hours < c.ref - TOLERANCE_H).map((c) => c.rank)).toEqual([]);
  });

  it("gives the same result through the whole pipeline (Blob reader, cache, no network)", async () => {
    const fs = await nodeFs();
    const blob = await fs.openAsBlob(historyPath);
    const stages = new Set<string>();
    const t0 = performance.now();
    const result = await runAnalysis(
      blob,
      { apiKey: "", onProgress: (p) => stages.add(p.stage) },
      {
        store: memoryVideoStore(records),
        fetch: () => Promise.reject(new Error("no network in this test")),
      },
    );
    console.log(`pipeline: ${(performance.now() - t0).toFixed(0)} ms`);
    expect([...stages]).toEqual(["reading", "parsing", "lookup", "computing", "done"]);
    expect(result.data).toEqual(data);
    expect(result.warnings.length).toBeGreaterThan(0);
  }, 60_000);
});
