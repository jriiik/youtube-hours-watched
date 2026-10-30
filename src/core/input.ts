import { AnalysisError, throwIfAborted } from "./errors";
import type { HistoryFormat, ParsedHistory } from "./history";
import { HtmlHistoryParser } from "./parseHtml";
import { parseJsonHistory } from "./parseJson";
import type { Progress } from "./types";
import { isZipSignature, listZipEntries, readBytes, readRange, readZipEntry } from "./zip";
import type { ByteSource, ReadOptions, ZipEntry } from "./zip";

/** A File, a Blob, or anything sliceable like one. */
export type HistoryFile = ByteSource & { readonly name?: string };

export interface HistorySource {
  format: HistoryFormat;
  /** Name for progress messages, e.g. "watch-history.html". */
  name: string;
  /** Bytes that will be read: the file size, or the entry's compressed size inside a zip. */
  size: number;
  read(opts?: ReadOptions): AsyncIterable<Uint8Array>;
}

const HEAD_BYTES = 1024;
/** How much of a zip entry is decompressed to tell whether it is a watch history. */
export const ZIP_SNIFF_BYTES = 1 << 20;
const NAMED = /(^|\/)watch-history\.(html|json)$/i;
const YOUTUBE_FOLDER = /(^|\/)[^/]*youtube[^/]*\//i;
const HISTORY_FILE = /\.(html?|json)$/i;

const NOT_HISTORY =
  "This file isn't a YouTube watch history. Choose watch-history.html or watch-history.json from your Google Takeout export, or the Takeout .zip file itself.";
const NOT_IN_ZIP =
  "There's no YouTube watch history in this .zip file. Takeout splits big exports into several .zip files, so try the others, and check that the export included YouTube's history.";
const TGZ =
  "This is a .tgz archive, which this app can't open. Extract it and choose watch-history.html, or export again from Takeout with .zip as the file type.";

/** Whether text from the start of a zip entry looks like a watch history, and in which format. */
export function sniffWatchHistory(head: string): HistoryFormat | null {
  const t = head.replace(/^\ufeff/, "").trimStart();
  if (!t.includes("/watch?v")) return null; // search-history files have the same layout
  if (t.startsWith("[") && /"titleUrl"\s*:/.test(t)) return "json";
  if (t.includes('class="outer-cell')) return "html";
  return null;
}

async function readEntryHead(src: ByteSource, entry: ZipEntry, signal?: AbortSignal): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  for await (const chunk of readZipEntry(src, entry, { signal, chunkSize: 64 * 1024 })) {
    text += decoder.decode(chunk, { stream: true });
    bytes += chunk.length;
    if (bytes >= ZIP_SNIFF_BYTES) break;
  }
  return text;
}

/**
 * Picks the watch history among a zip's entries: watch-history.html/.json by name (JSON first:
 * its times are exact), else, since folder and file names are translated, the biggest .html or
 * .json file in a YouTube folder whose first bytes look like one.
 */
export async function findHistoryEntry(
  src: ByteSource,
  entries: readonly ZipEntry[],
  signal?: AbortSignal,
): Promise<{ entry: ZipEntry; format: HistoryFormat } | null> {
  const files = entries.filter((e) => !e.name.endsWith("/"));
  const isJson = (e: ZipEntry) => e.name.toLowerCase().endsWith(".json");
  const named = files.filter((e) => NAMED.test(e.name));
  if (named.length) {
    const rank = (e: ZipEntry) => (isJson(e) ? 0 : 1) + (YOUTUBE_FOLDER.test(e.name) ? 0 : 2);
    const entry = named.sort((a, b) => rank(a) - rank(b))[0];
    return { entry, format: isJson(entry) ? "json" : "html" };
  }
  const candidates = files
    .filter((e) => HISTORY_FILE.test(e.name) && YOUTUBE_FOLDER.test(e.name))
    .sort((a, b) => b.size - a.size);
  for (const entry of candidates) {
    throwIfAborted(signal);
    let head: string;
    try {
      head = await readEntryHead(src, entry, signal);
    } catch (err) {
      if (err instanceof AnalysisError && err.reason === "bad-zip") continue;
      throw err;
    }
    const format = sniffWatchHistory(head);
    if (format) return { entry, format };
  }
  return null;
}

/** Finds the history in a file: a plain .html/.json, or inside a Takeout .zip. */
export async function openHistorySource(file: HistoryFile, signal?: AbortSignal): Promise<HistorySource> {
  const head = await readBytes(file, 0, Math.min(file.size, HEAD_BYTES));
  if (isZipSignature(head)) {
    const found = await findHistoryEntry(file, await listZipEntries(file), signal);
    if (!found) throw new AnalysisError("not-history", NOT_IN_ZIP);
    const { entry, format } = found;
    return {
      format,
      name: entry.name.slice(entry.name.lastIndexOf("/") + 1),
      size: entry.compressedSize,
      read: (opts) => readZipEntry(file, entry, opts),
    };
  }
  if (head[0] === 0x1f && head[1] === 0x8b) throw new AnalysisError("not-history", TGZ);
  const first = new TextDecoder().decode(head).replace(/^\ufeff/, "").trimStart()[0];
  const format: HistoryFormat | null = first === "[" ? "json" : first === "<" ? "html" : null;
  if (!format) throw new AnalysisError("not-history", NOT_HISTORY);
  return {
    format,
    name: file.name || `watch-history.${format}`,
    size: file.size,
    read: (opts) => readRange(file, 0, file.size, opts),
  };
}

export interface ReadHistoryOptions {
  signal?: AbortSignal;
  onProgress?: (p: Progress) => void;
}

/** Reads and parses the history, streaming: HTML is parsed as it is read and inflated. */
export async function readHistory(
  file: HistoryFile,
  opts: ReadHistoryOptions = {},
): Promise<{ parsed: ParsedHistory; source: HistorySource }> {
  opts.onProgress?.({ stage: "reading", detail: file.name });
  const source = await openHistorySource(file, opts.signal);
  const report = (done: number) => opts.onProgress?.({ stage: "reading", done, total: source.size, detail: source.name });
  report(0);
  const decoder = new TextDecoder();
  const chunks = source.read({ signal: opts.signal, onRead: report });
  if (source.format === "html") {
    const parser = new HtmlHistoryParser();
    for await (const chunk of chunks) parser.push(decoder.decode(chunk, { stream: true }));
    parser.push(decoder.decode());
    const parsed = parser.finish();
    if (!parsed.items) throw new AnalysisError("not-history", NOT_HISTORY);
    return { parsed, source };
  }
  const parts: string[] = [];
  for await (const chunk of chunks) parts.push(decoder.decode(chunk, { stream: true }));
  parts.push(decoder.decode());
  opts.onProgress?.({ stage: "parsing" });
  return { parsed: parseJsonHistory(parts.join("")), source };
}
