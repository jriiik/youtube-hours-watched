import type { EstimatedEntry } from "./estimate";
import type {
  CategoryStat,
  ChannelStat,
  DashboardData,
  MonthPoint,
  PeriodView,
  Summary,
  VideoStat,
  Weekday,
} from "./types";

export const DASHBOARD_LABEL = "Your watch history";
const WEEKDAYS: Weekday[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_MS = 86_400_000;
/** Entries at most 30 minutes apart belong to the same session (for the longest binge). */
const SESSION_BREAK_SEC = 1800;
const TOP_CHANNELS = 8;
const TOP_VIDEOS = 6;
const TOP_CATEGORIES = 8;
const SHORT_MAX_SEC = 60;
export const UNAVAILABLE_TITLE = "Deleted or private video";

/**
 * Python's round(x, digits), which the reference numbers use: the exact binary value is
 * rounded and exact ties go to even (round(0.25, 1) == 0.2, where 0.25.toFixed(1) is "0.3").
 */
export function pyRound(x: number, digits = 0): number {
  if (!Number.isFinite(x)) return x;
  if (x < 0) return -pyRound(-x, digits);
  const p = 10 ** digits;
  const scaled = x * p;
  const floor = Math.floor(scaled);
  if (scaled - floor === 0.5) {
    // A real tie only if x is exactly (2n+1)/(2p); x*p can look like one after rounding.
    const odd = 2 * floor + 1;
    const five = 5 ** digits;
    if (odd % five === 0 && odd / five / 2 ** (digits + 1) === x) return (floor % 2 === 0 ? floor : floor + 1) / p;
  }
  return Number(x.toFixed(digits));
}

/** Seconds to hours, one decimal. */
export function hours(seconds: number): number {
  return pyRound(seconds / 3600, 1);
}

interface Row {
  e: EstimatedEntry;
  /** Local calendar day: days since 1970-01-01. */
  day: number;
  date: string;
  month: string;
  year: string;
  /** 0 = Monday. */
  weekday: number;
  hour: number;
}

function dateOf(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

function toRows(entries: readonly EstimatedEntry[]): Row[] {
  const dates = new Map<number, string>();
  return entries.map((e) => {
    const day = Math.floor(e.localMs / DAY_MS);
    let date = dates.get(day);
    if (date === undefined) {
      date = dateOf(day);
      dates.set(day, date);
    }
    return {
      e,
      day,
      date,
      month: date.slice(0, 7),
      year: date.slice(0, 4),
      weekday: (((day + 3) % 7) + 7) % 7, // 1970-01-01 was a Thursday
      hour: Math.floor((e.localMs - day * DAY_MS) / 3_600_000),
    };
  });
}

function channelKey(e: EstimatedEntry): string {
  if (e.channelUrl) return e.channelUrl;
  return e.channel ? `name:${e.channel}` : "";
}

function isUrl(text: string): boolean {
  return /^https?:\/\//.test(text);
}

function argmax(totals: Map<string, number>): string {
  let best = "";
  let bestValue = -Infinity;
  for (const [key, value] of totals) {
    if (value > bestValue) {
      best = key;
      bestValue = value;
    }
  }
  return best;
}

interface Total {
  entries: number;
  sec: number;
}

/** One period (all time or one year) from the shared per-entry values; mirrors the reference aggregate(). */
function aggregateRows(rows: readonly Row[], firstDay: number, lastDay: number): PeriodView {
  let est = 0;
  let ub = 0;
  let night = 0;
  let weekend = 0;
  const daily = new Map<number, number>();
  const monthly = new Map<string, MonthPoint>();
  const heat = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  const channels = new Map<string, { name: string; sec: number; entries: number; categories: Map<string, number> }>();
  const categories = new Map<string, number>();
  const videos = new Map<string, { title: string; channel: string; times: number; sec: number; durationSec: number }>();
  const unavailable: Total = { entries: 0, sec: 0 };
  const shorts: Total = { entries: 0, sec: 0 };
  const music: Total = { entries: 0, sec: 0 };

  for (const r of rows) {
    const e = r.e;
    est += e.est;
    ub += e.ub;
    daily.set(r.day, (daily.get(r.day) ?? 0) + e.est);
    let m = monthly.get(r.month);
    if (!m) monthly.set(r.month, (m = { m: r.month, est: 0, ub: 0, n: 0 }));
    m.est += e.est;
    m.ub += e.ub;
    m.n++;
    heat[r.weekday][r.hour] += e.est;
    if (r.hour >= 22 || r.hour < 4) night += e.est;
    if (r.weekday >= 5) weekend += e.est;
    categories.set(e.category, (categories.get(e.category) ?? 0) + e.est);
    const key = channelKey(e);
    if (key) {
      let c = channels.get(key);
      if (!c) channels.set(key, (c = { name: e.channel, sec: 0, entries: 0, categories: new Map() }));
      if (e.channel) c.name = e.channel; // the newest name, if the channel was renamed
      c.sec += e.est;
      c.entries++;
      c.categories.set(e.category, (c.categories.get(e.category) ?? 0) + e.est);
    }
    let v = videos.get(e.videoId);
    if (!v) videos.set(e.videoId, (v = { title: "", channel: "", times: 0, sec: 0, durationSec: 0 }));
    if (!e.resumed) v.times++; // picking up where you left off isn't watching it again
    v.sec += e.est;
    if (e.title && !isUrl(e.title)) v.title = e.title;
    if (e.channel) v.channel = e.channel;
    if (e.durationSec !== null) v.durationSec = e.durationSec;
    const total = e.durationSec === null ? unavailable : e.durationSec <= SHORT_MAX_SEC ? shorts : null;
    if (total) {
      total.entries++;
      total.sec += e.est;
    }
    if (e.music) {
      music.entries++;
      music.sec += e.est;
    }
  }

  // Longest binge: a run of entries at most 30 minutes apart. A run still going at the
  // end of the period (a year view) ends there.
  let best = { sec: 0, start: -1, videos: 0 };
  let cur = { sec: 0, start: -1, videos: 0 };
  rows.forEach((r, i) => {
    if (cur.start < 0) cur = { sec: 0, start: i, videos: 0 };
    cur.sec += r.e.est;
    cur.videos++;
    if (r.e.gapSec === null || r.e.gapSec > SESSION_BREAK_SEC) {
      if (cur.sec > best.sec) best = cur;
      cur = { sec: 0, start: -1, videos: 0 };
    }
  });
  if (cur.start >= 0 && cur.sec > best.sec) best = cur;

  let busiestDay = firstDay;
  let busiestSec = -Infinity;
  for (const [day, sec] of daily) {
    if (sec > busiestSec) {
      busiestDay = day;
      busiestSec = sec;
    }
  }
  let streak = 0;
  let longestStreak = 0;
  let prev: number | null = null;
  for (const day of [...daily.keys()].sort((a, b) => a - b)) {
    streak = prev !== null && day - prev === 1 ? streak + 1 : 1;
    longestStreak = Math.max(longestStreak, streak);
    prev = day;
  }
  // The weekday and the hour of the day with the most watch time, each on its own.
  const weekdaySums = heat.map((row) => row.reduce((t, x) => t + x, 0));
  const hourSums = heat[0].map((_, h) => heat.reduce((t, row) => t + row[h], 0));
  const peakWeekday = weekdaySums.indexOf(Math.max(...weekdaySums));
  const peakHour = hourSums.indexOf(Math.max(...hourSums));
  const days = lastDay - firstDay + 1;

  const summary: Summary = {
    estimateHours: hours(est),
    upperBoundHours: hours(ub),
    entries: rows.length,
    uniqueVideos: videos.size,
    channels: channels.size,
    firstDate: dateOf(firstDay),
    lastDate: dateOf(lastDay),
    days,
    activeDays: daily.size,
    avgMinutesPerDay: pyRound(est / 60 / days, 1),
    longestBinge: {
      minutes: pyRound(best.sec / 60),
      date: best.start >= 0 ? rows[best.start].date : dateOf(firstDay),
      videos: best.videos,
    },
    busiestDay: { minutes: daily.size ? pyRound(busiestSec / 60) : 0, date: dateOf(busiestDay) },
    longestStreakDays: longestStreak,
    unavailable: { entries: unavailable.entries, estimateHours: hours(unavailable.sec) },
    shorts: { entries: shorts.entries, estimateHours: hours(shorts.sec) },
    youtubeMusic: { entries: music.entries, estimateHours: hours(music.sec) },
    nightShare: est > 0 ? pyRound(night / est, 3) : 0,
    weekendShare: est > 0 ? pyRound(weekend / est, 3) : 0,
    peakWeekday: WEEKDAYS[peakWeekday],
    peakHour,
  };

  const topChannels: ChannelStat[] = [...channels.values()]
    .sort((a, b) => b.sec - a.sec)
    .slice(0, TOP_CHANNELS)
    .map((c) => ({ name: c.name, category: argmax(c.categories), hours: hours(c.sec), videos: c.entries }));

  const topVideos: VideoStat[] = [...videos.values()]
    .filter((v) => v.times >= 2)
    .sort((a, b) => b.times - a.times || b.sec - a.sec)
    .slice(0, TOP_VIDEOS)
    .map((v) => ({
      title: v.title || UNAVAILABLE_TITLE,
      channel: v.channel,
      times: v.times,
      durationSec: v.durationSec,
      hours: hours(v.sec),
    }));

  const sortedCategories = [...categories].sort((a, b) => b[1] - a[1]);
  const categoryStats: CategoryStat[] = sortedCategories
    .slice(0, TOP_CATEGORIES)
    .map(([name, sec]) => ({ name, hours: hours(sec) }));
  let other = 0;
  for (const [, sec] of sortedCategories.slice(TOP_CATEGORIES)) other += sec;
  if (other) categoryStats.push({ name: "Other", hours: hours(other) });

  return {
    summary,
    monthly: [...monthly.values()]
      .sort((a, b) => (a.m < b.m ? -1 : a.m > b.m ? 1 : 0))
      .map((p) => ({ m: p.m, est: hours(p.est), ub: hours(p.ub), n: p.n })),
    heatmap: heat.map((row) => row.map(hours)),
    topChannels,
    topVideos,
    categories: categoryStats,
  };
}

function dayOf(year: number, month: number, day: number): number {
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

/**
 * The dashboard: "all" plus one view per local calendar year, all from the same per-entry
 * values. `entries` must be oldest first, as estimateEntries returns them.
 */
export function buildDashboard(entries: readonly EstimatedEntry[], label = DASHBOARD_LABEL): DashboardData {
  if (!entries.length) throw new RangeError("buildDashboard needs at least one entry");
  const rows = toRows(entries);
  const firstDay = rows[0].day;
  const lastDay = rows[rows.length - 1].day;
  const byYear = new Map<string, Row[]>();
  for (const r of rows) {
    let list = byYear.get(r.year);
    if (!list) byYear.set(r.year, (list = []));
    list.push(r);
  }
  const years = [...byYear.keys()].sort().reverse();
  const views: Record<string, PeriodView> = { all: aggregateRows(rows, firstDay, lastDay) };
  for (const year of [...years].reverse()) {
    const y = Number(year);
    views[year] = aggregateRows(byYear.get(year)!, Math.max(firstDay, dayOf(y, 1, 1)), Math.min(lastDay, dayOf(y, 12, 31)));
  }
  return { label, range: { first: dateOf(firstDay), last: dateOf(lastDay) }, years, views };
}
