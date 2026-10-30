// Shared contract between the analysis core (src/core) and the interface (src/ui).
// The analysis turns a Takeout watch history into DashboardData; the sample data in
// src/sample/sample-data.json has exactly the same shape.

export type Weekday = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

export interface Summary {
  /** Best estimate: each video counts until the next entry, never longer than the video. */
  estimateHours: number;
  /** If every video had been watched to the end. */
  upperBoundHours: number;
  /** Videos watched (history entries counted; ads and posts excluded). */
  entries: number;
  uniqueVideos: number;
  channels: number;
  /** YYYY-MM-DD in the history's local time. */
  firstDate: string;
  lastDate: string;
  /** Calendar days in the period, first to last date inclusive. */
  days: number;
  activeDays: number;
  /** estimateHours spread over `days`, in minutes. */
  avgMinutesPerDay: number;
  /** Longest run of entries less than 30 minutes apart. */
  longestBinge: { minutes: number; date: string; videos: number };
  busiestDay: { minutes: number; date: string };
  longestStreakDays: number;
  /** Deleted or private videos: their length is unknown. */
  unavailable: { entries: number; estimateHours: number };
  /** Videos of 60 seconds or less. */
  shorts: { entries: number; estimateHours: number };
  youtubeMusic: { entries: number; estimateHours: number };
  /** Share of the estimate watched between 22:00 and 04:00. */
  nightShare: number;
  weekendShare: number;
  /** The weekday with the most watch time. */
  peakWeekday: Weekday;
  /** The hour of the day (0-23) with the most watch time, over all weekdays. */
  peakHour: number;
}

/** One month: estimate hours, upper-bound hours, entries. `m` is YYYY-MM. */
export interface MonthPoint {
  m: string;
  est: number;
  ub: number;
  n: number;
}

export interface ChannelStat {
  name: string;
  category: string;
  hours: number;
  videos: number;
}

/** Most rewatched videos. */
export interface VideoStat {
  title: string;
  channel: string;
  times: number;
  durationSec: number;
  hours: number;
}

export interface CategoryStat {
  name: string;
  hours: number;
}

export interface PeriodView {
  summary: Summary;
  monthly: MonthPoint[];
  /** [7 weekdays Mon..Sun][24 hours]: estimate hours. */
  heatmap: number[][];
  /** Up to 8, by estimate hours. */
  topChannels: ChannelStat[];
  /** Up to 6, by times watched. */
  topVideos: VideoStat[];
  /** Up to 8 categories plus "Other". */
  categories: CategoryStat[];
}

export interface DashboardData {
  /** "Sample data (invented)" or "Your watch history". */
  label: string;
  range: { first: string; last: string };
  /** Newest first, e.g. ["2026", "2025", ...]. */
  years: string[];
  /** "all" plus one entry per year. */
  views: Record<string, PeriodView>;
}

// ---- Analysis pipeline -------------------------------------------------------

export type Stage = "reading" | "parsing" | "lookup" | "computing" | "done";

export interface Progress {
  stage: Stage;
  done?: number;
  total?: number;
  detail?: string;
}

export interface AnalyzeOptions {
  /** The user's YouTube Data API key ("" only where a proxy adds it, as in the cloud dev sandbox). */
  apiKey: string;
  onProgress?: (p: Progress) => void;
  signal?: AbortSignal;
}

export interface AnalyzeResult {
  data: DashboardData;
  /** Plain-language notes for the user, e.g. "674 videos are deleted or private". */
  warnings: string[];
  /** Set when the numbers are incomplete (the quota ran out part-way): what happened and what to do. */
  incomplete?: string;
}

export type ApiKeyProblem =
  | "invalid"
  | "api-not-enabled"
  | "wrong-api"
  | "referrer-blocked"
  | "quota"
  | "network"
  | "unknown";

export type ApiKeyCheck = { ok: true } | { ok: false; reason: ApiKeyProblem; message: string };
