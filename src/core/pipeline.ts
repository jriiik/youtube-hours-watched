import { buildDashboard } from "./aggregate";
import { openVideoStore } from "./cache";
import type { VideoStore } from "./cache";
import { AnalysisError, throwIfAborted } from "./errors";
import { estimateEntries, historyInTimeOrder, UNKNOWN_MAX_SEC } from "./estimate";
import type { ParsedHistory } from "./history";
import { readHistory } from "./input";
import type { HistoryFile } from "./input";
import { lookupVideos } from "./lookup";
import type { LookupResult } from "./lookup";
import type { AnalyzeOptions, AnalyzeResult, DashboardData, Progress } from "./types";
import type { FetchLike } from "./youtubeApi";

/** Replaceable parts, for tests and the real-data check. */
export interface PipelineDeps {
  store?: VideoStore;
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const count = (n: number) => n.toLocaleString("en-US");

function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function listing(parts: string[]): string {
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts.join("");
}

function plural(n: number, one: string, many: string): string {
  return `${count(n)} ${n === 1 ? one : many}`;
}

/** Why the numbers are incomplete, for a banner above them: the quota ran out part-way. */
export function incompleteNote(lookup: LookupResult): string | undefined {
  if (!lookup.quotaExceeded) return undefined;
  const n = lookup.notLookedUp;
  const missed = plural(n, "video", "videos");
  const counts = n === 1 ? "counts" : "count";
  return (
    (lookup.fetched
      ? `Your API key ran out of today's YouTube quota after looking up ${count(lookup.fetched)} of ${count(lookup.fetched + n)} videos, so ${missed} ${counts} as unknown length for now.`
      : `Your API key has no YouTube quota left today, so ${missed} couldn't be looked up and ${counts} as unknown length for now.`) +
    " Run the analysis again after midnight Pacific Time to finish; lengths already looked up are saved."
  );
}

/** Plain-language notes for the user, most important first. */
export function buildWarnings(parsed: ParsedHistory, lookup: LookupResult, data: DashboardData): string[] {
  const warnings: string[] = [];
  const all = data.views.all.summary;
  if (parsed.skipped.unparsedDates) {
    warnings.push(
      `${plural(parsed.skipped.unparsedDates, "video was", "videos were")} left out because the date couldn't be read.` +
        (parsed.format === "html" ? " In Google Takeout, choose JSON as the format for YouTube history to include them." : ""),
    );
  }
  const zones = Object.keys(parsed.unknownZones).map((z) => `"${z}"`);
  if (zones.length) {
    // Times of day come from the clock times as written; the zone only matters for the time
    // between videos, and a single unknown zone shifts every entry alike.
    const which = zones.length === 1 ? `time zone ${zones[0]} isn't` : `time zones ${listing(zones)} aren't`;
    warnings.push(
      `The ${which} known, so those times are read as UTC. Times of day are shown as written in your history; only the time between videos around a clock change may be slightly off.`,
    );
  }
  const unknown = all.unavailable.entries;
  if (unknown) {
    const why = lookup.quotaExceeded ? "deleted, private, live or not looked up yet" : "deleted, private or live";
    warnings.push(
      `${count(unknown)} of the videos you watched ${unknown === 1 ? "has" : "have"} no known length (${why}). ` +
        `${unknown === 1 ? "It counts" : "Each counts"} until the next video, at most ${UNKNOWN_MAX_SEC / 60} minutes.`,
    );
  }
  const { ads, posts, searches, other } = parsed.skipped;
  const left = [
    ads ? plural(ads, "ad", "ads") : "",
    posts ? plural(posts, "community post", "community posts") : "",
    searches ? plural(searches, "search", "searches") : "",
    other ? `${plural(other, "item", "items")} without a video link, such as survey answers and videos YouTube has removed` : "",
  ].filter(Boolean);
  if (left.length) warnings.push(`Not counted: ${listing(left)}.`);
  warnings.push(
    `Your watch history starts on ${longDate(all.firstDate)}. Anything watched before then, or while watch history was paused, isn't in the export.`,
  );
  return warnings;
}

function noVideosError(parsed: ParsedHistory): AnalysisError {
  if (parsed.skipped.unparsedDates) {
    return new AnalysisError(
      "dates",
      "The dates in this watch history couldn't be read (its language isn't supported yet). In Google Takeout, choose JSON as the format for YouTube history, then try again with watch-history.json.",
    );
  }
  return new AnalysisError("empty", "There are no watched videos in this watch history.");
}

/** The whole analysis on the current thread: read, parse, look up lengths, estimate, aggregate. */
export async function runAnalysis(file: HistoryFile, opts: AnalyzeOptions, deps: PipelineDeps = {}): Promise<AnalyzeResult> {
  const { signal } = opts;
  const report = (p: Progress) => opts.onProgress?.(p);
  throwIfAborted(signal);
  const { parsed } = await readHistory(file, { signal, onProgress: report });
  if (!parsed.entries.length) throw noVideosError(parsed);
  report({ stage: "parsing", done: parsed.entries.length, total: parsed.entries.length });

  const ids = [...new Set(parsed.entries.map((e) => e.videoId))];
  const store = deps.store ?? (await openVideoStore());
  let lookup: LookupResult;
  try {
    lookup = await lookupVideos(ids, {
      apiKey: opts.apiKey,
      store,
      fetch: deps.fetch,
      signal,
      sleep: deps.sleep,
      now: deps.now?.(),
      onProgress: report,
    });
  } finally {
    if (!deps.store) store.close?.();
  }

  throwIfAborted(signal);
  report({ stage: "computing" });
  const data = buildDashboard(estimateEntries(historyInTimeOrder(parsed.entries), lookup.videos));
  const result: AnalyzeResult = { data, warnings: buildWarnings(parsed, lookup, data) };
  const incomplete = incompleteNote(lookup);
  if (incomplete) result.incomplete = incomplete;
  report({ stage: "done" });
  return result;
}
