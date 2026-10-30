import { AnalysisError } from "./errors";
import { emptySkipCounts, isAdMarker, isMusicUrl, isPostUrl, videoIdFromUrl } from "./history";
import type { ParsedHistory, WatchEntry } from "./history";

// watch-history.json: [{ header, title: "Watched <title>", titleUrl, subtitles: [{ name, url }],
// time: ISO 8601 UTC, details: [{ name: "From Google Ads" }] }], newest first.

interface JsonItem {
  header?: unknown;
  title?: unknown;
  titleUrl?: unknown;
  subtitles?: unknown;
  time?: unknown;
  details?: unknown;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isAd(details: unknown): boolean {
  return Array.isArray(details) && details.some((d) => d && typeof d === "object" && isAdMarker(str((d as { name?: unknown }).name)));
}

/**
 * Titles start with the translated verb ("Watched ", ...). A deleted video's title is the verb
 * plus its URL, which gives the verb away; failing that, it is the titles' common prefix (cut
 * back to a word boundary, at most three words), or the English one for short histories.
 */
function verbPrefix(titles: string[], urls: string[]): string {
  for (let i = 0; i < titles.length; i++) {
    if (urls[i] && titles[i].length > urls[i].length && titles[i].endsWith(urls[i])) {
      return titles[i].slice(0, titles[i].length - urls[i].length);
    }
  }
  if (titles.length < 20) return "Watched ";
  let prefix = titles[0].slice(0, 40);
  for (const t of titles) {
    while (prefix && !t.startsWith(prefix)) prefix = prefix.slice(0, -1);
    if (!prefix) return "";
  }
  prefix = prefix.slice(0, prefix.lastIndexOf(" ") + 1);
  const words = prefix.trim().split(" ");
  return words.length > 3 ? words.slice(0, 3).join(" ") + " " : prefix;
}

/** Wall-clock time in the computer's time zone, encoded as if it were UTC. */
function localFromUtc(utcMs: number): number {
  return utcMs - new Date(utcMs).getTimezoneOffset() * 60_000;
}

export function parseJsonItems(items: unknown[]): ParsedHistory {
  const skipped = emptySkipCounts();
  const entries: WatchEntry[] = [];
  const urls: string[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") {
      skipped.other++;
      continue;
    }
    const item = raw as JsonItem;
    const url = str(item.titleUrl);
    const videoId = url ? videoIdFromUrl(url) : null;
    if (!videoId) {
      if (isPostUrl(url)) skipped.posts++;
      else skipped.other++;
      continue;
    }
    if (isAd(item.details)) {
      skipped.ads++;
      continue;
    }
    const utcMs = Date.parse(str(item.time));
    if (!Number.isFinite(utcMs)) {
      skipped.unparsedDates++;
      continue;
    }
    const sub: unknown = Array.isArray(item.subtitles) ? item.subtitles[0] : undefined;
    const channel = sub && typeof sub === "object" ? (sub as { name?: unknown; url?: unknown }) : {};
    entries.push({
      videoId,
      title: str(item.title),
      channel: str(channel.name).trim(),
      channelUrl: str(channel.url),
      music: str(item.header) === "YouTube Music" || isMusicUrl(url),
      utcMs,
      localMs: localFromUtc(utcMs),
    });
    urls.push(url);
  }
  const prefix = verbPrefix(
    entries.map((e) => e.title),
    urls,
  );
  for (const e of entries) {
    if (prefix && e.title.startsWith(prefix)) e.title = e.title.slice(prefix.length);
    e.title = e.title.trim();
  }
  return { format: "json", entries, items: items.length, skipped, unknownZones: {} };
}

/** Parses a whole watch-history.json. */
export function parseJsonHistory(text: string): ParsedHistory {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new AnalysisError("not-history", "This JSON file couldn't be read. It may be incomplete: try exporting it again.");
  }
  if (!Array.isArray(data)) {
    throw new AnalysisError("not-history", "This JSON file isn't a YouTube watch history.");
  }
  return parseJsonItems(data);
}
