// What the parsers extract from a Takeout watch history, before video lengths are known.

export type HistoryFormat = "html" | "json";

/** One watched video. */
export interface WatchEntry {
  videoId: string;
  /** Title as the history shows it; deleted videos often show their URL instead. */
  title: string;
  /** Trimmed channel name; "" when the history has none (deleted or private videos). */
  channel: string;
  /** Channel URL; "" when the history has none. */
  channelUrl: string;
  /** Watched in YouTube Music. */
  music: boolean;
  /** When it was watched, in ms since the epoch. */
  utcMs: number;
  /** The wall-clock time written in the history, in ms, encoded as if it were UTC (for day/hour stats). */
  localMs: number;
}

/** History items that are not counted, by kind. */
export interface SkipCounts {
  ads: number;
  /** Community posts ("Viewed" entries). */
  posts: number;
  /** Anything else without a video link: surveys, removed videos, searches... */
  other: number;
  /** Videos whose date couldn't be read. */
  unparsedDates: number;
}

export interface ParsedHistory {
  format: HistoryFormat;
  /** In file order (Takeout lists the newest first). */
  entries: WatchEntry[];
  /** Every history item seen, counted or not. */
  items: number;
  skipped: SkipCounts;
  /** Time zone labels that couldn't be mapped to an offset, with how many entries used each. */
  unknownZones: Record<string, number>;
}

export function emptySkipCounts(): SkipCounts {
  return { ads: 0, posts: 0, other: 0, unparsedDates: 0 };
}

const ID = "([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])";
const VIDEO_URLS = [
  new RegExp(`/watch\\?(?:[^#]*&)?v=${ID}`),
  new RegExp(`youtu\\.be/${ID}`),
  new RegExp(`youtube\\.com/(?:shorts|live)/${ID}`),
];

/** The 11-character video ID of a watch link (www, m. or music.youtube.com), or null. */
export function videoIdFromUrl(url: string): string | null {
  for (const re of VIDEO_URLS) {
    const m = re.exec(url);
    if (m) return m[1];
  }
  return null;
}

/** Community posts link to youtube.com/post/... */
export function isPostUrl(url: string): boolean {
  return url.includes("/post/");
}

export function isMusicUrl(url: string): boolean {
  return /^https?:\/\/music\.youtube\.com\//.test(url);
}

/** "From Google Ads" is translated, but the brand name stays the same in every language. */
export function isAdMarker(text: string): boolean {
  return text.includes("Google Ads");
}
