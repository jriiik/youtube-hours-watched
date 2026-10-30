import type { CategoryStat, ChannelStat, MonthPoint, Summary, VideoStat } from "../../core/types";
import {
  MONTHS,
  WEEKDAYS,
  clamp,
  clock,
  count,
  dur,
  fdate,
  hourLabel,
  hoursFigure,
  hrs,
  initials,
  int,
  monthName,
  weekdayPlural,
} from "../format";

// Everything the Night design computed in renderVals(), as pure functions of the data.

export type Mode = "est" | "ub";

const ACCENT_RGB = "20,184,166";
export const accentAlpha = (alpha: number) => `rgba(${ACCENT_RGB},${alpha})`;

export function periodLabel(period: string): string {
  return period === "all" ? "All time" : period;
}

export function modeLabel(mode: Mode): string {
  return mode === "ub" ? "If you finished every video" : "Best estimate";
}

// ---- Hero --------------------------------------------------------------------

export interface HeroModel {
  heroNum: string;
  heroDays: string;
  avgText: string;
  avgSub: string;
  /** Width of the estimate segment in the split bar, 0-100. */
  estPct: number;
  estTotal: string;
  ubTotal: string;
}

export function heroModel(s: Summary, mode: Mode): HeroModel {
  const total = mode === "ub" ? s.upperBoundHours : s.estimateHours;
  const avgMin = mode === "ub" ? (s.days > 0 ? (s.upperBoundHours * 60) / s.days : 0) : s.avgMinutesPerDay;
  const days = Math.round(total / 24);
  return {
    heroNum: hoursFigure(total),
    heroDays: days >= 1 ? `≈ ${count(days, "day", "days")}` : "< 1 day",
    avgText: dur(avgMin),
    avgSub: `a day on average, over ${count(s.days, "day", "days")}`,
    estPct: s.upperBoundHours > 0 ? clamp((s.estimateHours / s.upperBoundHours) * 100, 0, 100) : 100,
    estTotal: hrs(s.estimateHours),
    ubTotal: hrs(s.upperBoundHours),
  };
}

// ---- Key stats -----------------------------------------------------------------

export interface KeyStatsModel {
  entries: string;
  unique: string;
  channels: string;
  streak: string;
  bingeDur: string;
  bingeSub: string;
  busyDur: string;
  busyDate: string;
}

export function keyStatsModel(s: Summary): KeyStatsModel {
  const binge = s.longestBinge;
  return {
    entries: int(s.entries),
    unique: int(s.uniqueVideos),
    channels: int(s.channels),
    streak: count(s.longestStreakDays, "day", "days"),
    bingeDur: dur(binge.minutes),
    bingeSub: [count(binge.videos, "video", "videos"), fdate(binge.date)].filter(Boolean).join(" · "),
    busyDur: dur(s.busiestDay.minutes),
    busyDate: fdate(s.busiestDay.date),
  };
}

// ---- Monthly chart -----------------------------------------------------------

export interface MonthRow {
  m: string;
  year: string;
  /** 0-11 */
  month: number;
  est: number;
  ub: number;
  n: number;
}

/** Sorts the months and fills gaps with empty months so the time axis stays even. */
export function fillMonths(points: MonthPoint[]): MonthRow[] {
  const byKey = new Map<string, MonthPoint>();
  for (const p of points) if (/^\d{4}-\d{2}$/.test(p.m)) byKey.set(p.m, p);
  const keys = [...byKey.keys()].sort();
  if (keys.length === 0) return [];
  const rows: MonthRow[] = [];
  let [y, m] = keys[0].split("-").map(Number);
  const [ly, lm] = keys[keys.length - 1].split("-").map(Number);
  // A malformed range could loop for ages; 1,200 months is a century.
  while ((y < ly || (y === ly && m <= lm)) && rows.length < 1200) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    const p = byKey.get(key);
    rows.push({ m: key, year: String(y), month: m - 1, est: p?.est ?? 0, ub: p?.ub ?? 0, n: p?.n ?? 0 });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return rows;
}

const NICE_STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000];

/** Gridline step so three steps cover the tallest bar (the design used 10/20/25/50/100). */
export function niceStep(max: number): number {
  const found = NICE_STEPS.find((x) => x * 3 >= max);
  return found ?? Math.ceil(max / 3 / 1000) * 1000;
}

export interface BarModel {
  key: string;
  /** Heights as a share of the plot, 0-100. */
  ubH: number;
  estH: number;
  label: string;
  /** Faint divider before January in the multi-year view. */
  yearLine: boolean;
}

/** Chart geometry. It does not depend on the mode, so switching modes re-renders no bars. */
export interface MonthlyModel {
  rows: MonthRow[];
  bars: BarModel[];
  /** Pixels between bars: the design's 3 px (10 px by month), tighter for very long histories. */
  gap: number;
  ticks: { label: string; pct: number }[];
  /** Years along the axis (long ranges) or month names (one year, or a short history). */
  style: "years" | "months";
}

/** Below this many months a multi-year range is labelled by month, like a single year. */
const MONTH_LABEL_LIMIT = 18;

export function monthlyModel(points: MonthPoint[], isAll: boolean): MonthlyModel {
  const rows = fillMonths(points);
  const style = isAll && rows.length > MONTH_LABEL_LIMIT ? "years" : "months";
  const maxV = rows.reduce((mx, r) => Math.max(mx, r.ub, r.est), 0);
  const step = niceStep(maxV);
  const top = step * 3;

  const bars = rows.map((r, i): BarModel => {
    let label: string;
    if (style === "years") {
      // The first bar carries its year only when there is room before the next January.
      const firstFits = i === 0 && 12 - r.month >= 4;
      label = r.month === 0 || firstFits ? r.year : "";
    } else {
      label = isAll && r.month === 0 && i > 0 ? r.year : MONTHS[r.month];
    }
    return {
      key: r.m,
      ubH: clamp((r.ub / top) * 100, 0, 100),
      estH: clamp((r.est / top) * 100, 0, 100),
      label,
      yearLine: isAll && r.month === 0 && i > 0,
    };
  });

  const ticks = [0, 1, 2, 3].map((k) => ({ label: `${hoursFigure(k * step)} h`, pct: (k * 100) / 3 }));
  const gap = style === "months" ? 10 : rows.length <= 100 ? 3 : rows.length <= 160 ? 2 : 1;
  return { rows, bars, ticks, style, gap };
}

/** Screen reader summary of the chart, e.g. "... 92 months, highest Feb 2020 at 82.6 h." */
export function monthlyAria(rows: MonthRow[], mode: Mode, period: string): string {
  if (!rows.length) return `Monthly watch time, ${periodLabel(period)}: no months to show.`;
  const key = mode === "ub" ? "ub" : "est";
  let peak = 0;
  rows.forEach((r, i) => {
    if (r[key] > rows[peak][key]) peak = i;
  });
  return `Monthly watch time, ${periodLabel(period)}, ${modeLabel(mode).toLowerCase()}: ${count(rows.length, "month", "months")}, highest ${monthName(rows[peak].m)} at ${hrs(rows[peak][key])}.`;
}

/** Tooltip anchor for bar i of n: centre of the bar, kept inside the plot near the edges. */
export function tipPlacement(i: number, n: number, edge = 14): { left: number; shift: string } {
  const left = ((i + 0.5) / n) * 100;
  return { left, shift: left < edge ? "0%" : left > 100 - edge ? "-100%" : "-50%" };
}

export function monthTip(r: MonthRow) {
  return { month: monthName(r.m), est: hrs(r.est), ub: hrs(r.ub), n: count(r.n, "video", "videos") };
}

// ---- Heatmap -----------------------------------------------------------------

export interface HeatmapModel {
  /** 7 rows (Mon..Sun) of 24 hours, padded with zeros when the data is short. */
  grid: number[][];
  max: number;
  colors: string[][];
  legend: string[];
  peakText: string;
}

const EMPTY_CELL = "#161B23";

export function heatColor(x: number, max: number): string {
  if (!(x > 0) || !(max > 0)) return EMPTY_CELL;
  return accentAlpha(Number((0.1 + 0.9 * Math.pow(Math.min(x / max, 1), 0.9)).toFixed(3)));
}

export function heatmapModel(heatmap: number[][]): HeatmapModel {
  const grid = WEEKDAYS.map((_, r) => Array.from({ length: 24 }, (_, c) => Math.max(0, Number(heatmap[r]?.[c]) || 0)));
  let max = 0;
  let pr = 0;
  let pc = 0;
  grid.forEach((row, r) =>
    row.forEach((x, c) => {
      if (x > max) {
        max = x;
        pr = r;
        pc = c;
      }
    }),
  );
  return {
    grid,
    max,
    colors: grid.map((row) => row.map((x) => heatColor(x, max))),
    legend: [0, 0.25, 0.5, 0.75, 1].map((t) => heatColor(t * max, max)),
    peakText: max > 0 ? `Top slot: ${WEEKDAYS[pr]} ${hourLabel(pc)}, ${hrs(max)}` : "",
  };
}

export function heatTip(grid: number[][], r: number, c: number) {
  return { when: `${WEEKDAYS[r]} ${hourLabel(c)}`, val: hrs(grid[r][c]) };
}

export function heatmapAria(s: Summary, period: string): string {
  return `Heatmap of watch time by weekday and hour, ${periodLabel(period)}. Most watched: ${weekdayPlural(s.peakWeekday)}, and around ${hourLabel(s.peakHour)}.`;
}

export function insightText(s: Summary): string {
  return `You watch most on ${weekdayPlural(s.peakWeekday)}, and most around ${hourLabel(s.peakHour)}. ${Math.round(s.nightShare * 100)}% of your watch time is after 10 pm.`;
}

// ---- Lists -------------------------------------------------------------------

export interface CategoryRow {
  name: string;
  hours: string;
  pct: string;
  /** Bar width relative to the largest category, 0-100. */
  w: number;
  isOther: boolean;
}

export function categoryRows(cats: CategoryStat[]): CategoryRow[] {
  const sum = cats.reduce((t, c) => t + c.hours, 0);
  const max = cats.reduce((mx, c) => Math.max(mx, c.hours), 0);
  return cats.map((c) => ({
    name: c.name,
    hours: hrs(c.hours),
    pct: `${sum > 0 ? ((c.hours / sum) * 100).toFixed(1) : "0.0"}%`,
    w: max > 0 ? (c.hours / max) * 100 : 0,
    isOther: c.name === "Other",
  }));
}

export interface ChannelRow {
  rank: string;
  initials: string;
  name: string;
  category: string;
  hours: string;
  share: string;
  w: number;
  lead: boolean;
}

export function channelRows(channels: ChannelStat[], estimateHours: number): ChannelRow[] {
  const max = channels.reduce((mx, c) => Math.max(mx, c.hours), 0);
  return channels.map((c, i) => ({
    rank: String(i + 1).padStart(2, "0"),
    initials: initials(c.name),
    name: c.name,
    category: c.category,
    hours: hrs(c.hours),
    share: estimateHours > 0 ? `${((c.hours / estimateHours) * 100).toFixed(1)}%` : "",
    w: max > 0 ? (c.hours / max) * 100 : 0,
    lead: i === 0,
  }));
}

/** Abstract thumbnails: base, lower band, orb x %, orb y %, orb size px. */
const THUMBS: [string, string, number, number, number][] = [
  ["#1C2433", "#273247", 64, 18, 18],
  ["#251F2E", "#33293F", 22, 26, 14],
  ["#1A2629", "#22343A", 70, 14, 20],
  ["#2A211D", "#3A2C25", 26, 22, 16],
  ["#1D2230", "#2A3146", 52, 16, 12],
  ["#22202A", "#2F2B3A", 76, 28, 15],
];

export interface VideoRow {
  title: string;
  channel: string;
  times: string;
  /** "" when the length is unknown. */
  dur: string;
  hours: string;
  thumb: { base: string; band: string; orbX: number; orbY: number; orbSize: number; orb: string };
  lead: boolean;
}

export function videoRows(videos: VideoStat[]): VideoRow[] {
  return videos.map((x, i) => {
    const [base, band, orbX, orbY, orbSize] = THUMBS[i % THUMBS.length];
    return {
      title: x.title,
      channel: x.channel,
      times: `${int(x.times)}×`,
      dur: x.durationSec > 0 ? clock(x.durationSec) : "",
      hours: `${hrs(x.hours)} total`,
      thumb: { base, band, orbX, orbY, orbSize, orb: i % 2 ? "rgba(238,241,246,0.6)" : accentAlpha(0.9) },
      lead: i === 0,
    };
  });
}

// ---- Notes -------------------------------------------------------------------

export function dataNotes(s: Summary): string[] {
  const notes = [`History from ${fdate(s.firstDate)} to ${fdate(s.lastDate)}: only what Google kept.`];
  const n = s.unavailable.entries;
  if (n > 0) {
    notes.push(
      n === 1
        ? "1 video is deleted or private: its time is estimated from timestamps alone."
        : `${int(n)} videos are deleted or private: their time is estimated from timestamps alone.`,
    );
  }
  return notes;
}
