import { describe, expect, it } from "vitest";
import type { DashboardData } from "../../core/types";
import sample from "../../sample/sample-data.json";
import {
  categoryRows,
  channelRows,
  dataNotes,
  fillMonths,
  heatColor,
  heatmapModel,
  heroModel,
  insightText,
  keyStatsModel,
  monthlyAria,
  monthlyModel,
  niceStep,
  tipPlacement,
  videoRows,
} from "./model";

const data = sample as unknown as DashboardData;
const all = data.views.all;

describe("hero", () => {
  it("matches the design's numbers for all time", () => {
    const est = heroModel(all.summary, "est");
    expect(est.heroNum).toBe("4,254");
    expect(est.heroDays).toBe("≈ 177 days");
    expect(est.avgText).toBe("1 h 32 min");
    expect(est.avgSub).toBe("a day on average, over 2,788 days");
    expect(est.estTotal).toBe("4,254 h");
    expect(est.ubTotal).toBe("7,323 h");
    expect(est.estPct).toBeCloseTo(58.1, 1);

    const ub = heroModel(all.summary, "ub");
    expect(ub.heroNum).toBe("7,323");
    expect(ub.heroDays).toBe("≈ 305 days");
    expect(ub.avgText).toBe("2 h 38 min");
  });

  it("survives an empty period", () => {
    const s = { ...all.summary, estimateHours: 0, upperBoundHours: 0, days: 0, avgMinutesPerDay: 0 };
    const h = heroModel(s, "ub");
    expect(h.heroNum).toBe("0");
    expect(h.heroDays).toBe("< 1 day");
    expect(h.estPct).toBe(100);
    expect(h.avgText).toBe("0 min");
    expect(heroModel({ ...s, estimateHours: 0.24, upperBoundHours: 0.3 }, "est").heroNum).toBe("0.2");
  });
});

describe("key stats", () => {
  it("formats binge and busiest day", () => {
    const k = keyStatsModel(all.summary);
    expect(k.entries).toBe("57,260");
    expect(k.streak).toBe("45 days");
    expect(k.bingeDur).toBe("5 h 18 min");
    expect(k.bingeSub).toBe("46 videos · Jul 19, 2020");
    expect(k.busyDur).toBe("11 h 26 min");
    expect(k.busyDate).toBe("Aug 1, 2021");
  });
});

describe("monthly chart", () => {
  it("lays out 92 months with year labels and a 50 h grid", () => {
    const m = monthlyModel(all.monthly, true);
    expect(m.bars).toHaveLength(92);
    expect(m.gap).toBe(3);
    expect(m.style).toBe("years");
    expect(m.ticks.map((t) => t.label)).toEqual(["0 h", "50 h", "100 h", "150 h"]);
    expect(m.bars[0].label).toBe("2019");
    expect(m.bars[1].label).toBe("");
    expect(m.bars[10].label).toBe("2020");
    expect(m.bars[10].yearLine).toBe(true);
    expect(m.bars[0].yearLine).toBe(false);
    expect(monthlyAria(m.rows, "est", "all")).toBe(
      "Monthly watch time, All time, best estimate: 92 months, highest Jan 2020 at 82.6 h.",
    );
  });

  it("labels a single year by month", () => {
    const m = monthlyModel(data.views["2025"].monthly, false);
    expect(m.style).toBe("months");
    expect(m.gap).toBe(10);
    expect(m.bars.map((b) => b.label)).toEqual(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);
    expect(m.bars.every((b) => !b.yearLine)).toBe(true);
    expect(monthlyAria(m.rows, "ub", "2025")).toMatch(/^Monthly watch time, 2025, if you finished every video: 12 months, highest /);
  });

  it("fills gaps and handles empty data", () => {
    const rows = fillMonths([
      { m: "2025-11", est: 1, ub: 2, n: 3 },
      { m: "2026-02", est: 4, ub: 5, n: 6 },
    ]);
    expect(rows.map((r) => r.m)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(rows[1].n).toBe(0);
    const empty = monthlyModel([], true);
    expect(empty.bars).toHaveLength(0);
    expect(monthlyAria(empty.rows, "est", "all")).toContain("no months");
  });

  it("picks nice gridline steps", () => {
    expect(niceStep(137.4)).toBe(50);
    expect(niceStep(59)).toBe(20);
    expect(niceStep(2)).toBe(1);
    expect(niceStep(400)).toBe(200);
    expect(niceStep(0.2)).toBe(0.1);
    expect(niceStep(0)).toBe(0.1);
    const tiny = monthlyModel([{ m: "2025-03", est: 0.2, ub: 0.25, n: 6 }], true);
    expect(tiny.ticks.map((t) => t.label)).toEqual(["0 h", "0.1 h", "0.2 h", "0.3 h"]);
  });

  it("keeps tooltips inside the plot", () => {
    expect(tipPlacement(0, 92).shift).toBe("0%");
    expect(tipPlacement(46, 92).shift).toBe("-50%");
    expect(tipPlacement(91, 92).shift).toBe("-100%");
  });
});

describe("heatmap", () => {
  it("finds the top slot and scales colours", () => {
    const h = heatmapModel(all.heatmap);
    expect(h.peakText).toBe("Top slot: Sat 11 pm, 74 h");
    expect(h.legend[0]).toBe("#161B23");
    expect(h.legend[4]).toBe("rgba(20,184,166,1)");
    expect(heatColor(0, 10)).toBe("#161B23");
  });

  it("pads short data and hides the peak when empty", () => {
    const h = heatmapModel([[1, 2]]);
    expect(h.grid).toHaveLength(7);
    expect(h.grid[6]).toHaveLength(24);
    expect(heatmapModel([]).peakText).toBe("");
  });

  it("writes the insight line: the busiest weekday and hour, which need not meet in the top slot", () => {
    expect(insightText(all.summary)).toBe(
      "You watch most on Sundays, and most around 10 pm. 38% of your watch time is between 10 pm and 4 am.",
    );
  });
});

describe("lists and notes", () => {
  it("computes category shares", () => {
    const rows = categoryRows(all.categories);
    expect(rows[0]).toMatchObject({ name: "Music", hours: "837 h", pct: "19.7%" });
    expect(rows[0].w).toBeCloseTo(97.3, 1);
    // "Other" is the largest bucket in the sample, so it sets the scale, as in the design.
    expect(rows.at(-1)).toMatchObject({ isOther: true, w: 100 });
  });

  it("ranks channels with share of the estimate", () => {
    const rows = channelRows(all.topChannels, all.summary.estimateHours);
    expect(rows[0]).toMatchObject({ rank: "01", hours: "217.2 h", share: "5.1%", w: 100, lead: true });
    expect(rows[1].lead).toBe(false);
  });

  it("formats rewatched videos", () => {
    const rows = videoRows(all.topVideos);
    expect(rows[0].times).toBe("78×");
    expect(rows[0].dur).toBe("1:12:00");
    expect(rows[0].hours).toBe("42.5 h total");
    expect(videoRows([{ title: "t", channel: "c", times: 2, durationSec: 0, hours: 0 }])[0].dur).toBe("");
  });

  it("writes the data notes", () => {
    expect(dataNotes(all.summary)).toEqual([
      "History from Mar 14, 2019 to Oct 30, 2026: only what Google kept.",
      "674 videos are deleted or private: their time is estimated from timestamps alone.",
    ]);
    const none = { ...all.summary, unavailable: { entries: 0, estimateHours: 0 } };
    expect(dataNotes(none)).toHaveLength(1);
  });
});

describe("long histories", () => {
  it("tightens the gap and keeps year labels for 20 years", () => {
    const points = Array.from({ length: 240 }, (_, i) => ({
      m: `${2007 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`,
      est: 10,
      ub: 20,
      n: 5,
    }));
    const m = monthlyModel(points, true);
    expect(m.gap).toBe(1);
    expect(m.bars.filter((b) => b.label).map((b) => b.label)).toHaveLength(20);
  });

  it("labels a short multi-year history by month, with the year at January", () => {
    const points = ["2025-11", "2025-12", "2026-01", "2026-02"].map((m) => ({ m, est: 1, ub: 2, n: 1 }));
    const m = monthlyModel(points, true);
    expect(m.style).toBe("months");
    expect(m.bars.map((b) => b.label)).toEqual(["Nov", "Dec", "2026", "Feb"]);
    expect(m.bars[2].yearLine).toBe(true);
  });
});
