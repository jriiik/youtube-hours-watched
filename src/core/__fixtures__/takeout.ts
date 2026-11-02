// Synthetic Takeout data for tests: the real markup shape with invented IDs, titles and names.

import type { ByteSource } from "../zip";

export interface HtmlEntryOptions {
  /** 11 characters. */
  videoId?: string;
  title?: string;
  /** null: no channel link (deleted or private video). */
  channel?: string | null;
  channelId?: string;
  /** As written, e.g. "30 Oct 2026, 11:41:27 CET". */
  date: string;
  header?: string;
  verb?: string;
  /** The first link; defaults to the video's watch URL. */
  href?: string;
  ad?: boolean;
  /** The space after the verb: "&nbsp;" (default), U+00A0 or a plain space. */
  space?: "entity" | "char" | "plain";
}

const CAPTION_WHY =
  "<b>Why is this here?</b><br>&emsp;This activity was saved to your Google Account because the following settings were on:&nbsp;YouTube watch history.&nbsp;You can control these settings &nbsp;<a href=\"https://myaccount.google.com/activitycontrols\">here</a>.";

function block(header: string, body: string, ad = false): string {
  const details = ad ? "<b>Details:</b><br>&emsp;From Google Ads<br>" : "";
  return (
    '<div class="outer-cell mdl-cell mdl-cell--12-col mdl-shadow--2dp"><div class="mdl-grid">' +
    `<div class="header-cell mdl-cell mdl-cell--12-col"><p class="mdl-typography--title">${header}<br></p></div>` +
    `<div class="content-cell mdl-cell mdl-cell--6-col mdl-typography--body-1">${body}</div>` +
    '<div class="content-cell mdl-cell mdl-cell--6-col mdl-typography--body-1 mdl-typography--text-right"></div>' +
    `<div class="content-cell mdl-cell mdl-cell--12-col mdl-typography--caption"><b>Products:</b><br>&emsp;${header}<br>${details}${CAPTION_WHY}</div>` +
    "</div></div>"
  );
}

/** One history item in Takeout's HTML markup. */
export function htmlEntry(o: HtmlEntryOptions): string {
  const header = o.header ?? "YouTube";
  const host = header === "YouTube Music" ? "music.youtube.com" : "www.youtube.com";
  const href = o.href ?? `https://${host}/watch?v=${o.videoId ?? "AAAAAAAAAAA"}`;
  const space = o.space === "char" ? "\u00a0" : o.space === "plain" ? " " : "&nbsp;";
  const channel =
    o.channel === null ? "" : `<a href="https://www.youtube.com/channel/${o.channelId ?? "UCchannel000000000000001"}">${o.channel ?? "Test Channel"}</a><br>`;
  return block(header, `${o.verb ?? "Watched"}${space}<a href="${href}">${o.title ?? href}</a><br>${channel}${o.date}<br>`, o.ad);
}

/** An item without links, like "Answered survey question". */
export function htmlTextEntry(lines: string[], date: string): string {
  return block("YouTube", `${lines.join("<br>")}<br>${date}<br>`);
}

export function takeoutHtml(blocks: readonly string[]): string {
  return (
    '<html><head><title>My Activity History</title><style type="text/css">.mdl-grid{display:flex}</style></head>' +
    `<body><div class="mdl-grid">${blocks.join("")}</div></body></html>`
  );
}

export interface JsonEntryOptions {
  videoId?: string;
  title?: string;
  channel?: string | null;
  channelUrl?: string;
  /** ISO 8601 UTC. */
  time: string;
  header?: string;
  titleUrl?: string | null;
  ad?: boolean;
  verb?: string;
}

/** One item of watch-history.json. */
export function jsonEntry(o: JsonEntryOptions): Record<string, unknown> {
  const url = o.titleUrl === undefined ? `https://www.youtube.com/watch?v=${o.videoId ?? "AAAAAAAAAAA"}` : o.titleUrl;
  const item: Record<string, unknown> = {
    header: o.header ?? "YouTube",
    title: `${o.verb ?? "Watched"} ${o.title ?? url ?? "a video that has been removed"}`,
    time: o.time,
    products: ["YouTube"],
    activityControls: ["YouTube watch history"],
  };
  if (url !== null) item.titleUrl = url;
  if (o.channel !== null) {
    item.subtitles = [{ name: o.channel ?? "Test Channel", url: o.channelUrl ?? "https://www.youtube.com/channel/UCchannel000000000000001" }];
  }
  if (o.ad) item.details = [{ name: "From Google Ads" }];
  return item;
}

/** Google's JSON writer escapes "=" in URLs as =. */
export function takeoutJson(items: readonly Record<string, unknown>[]): string {
  return JSON.stringify(items, null, 2).replace(/=/g, "\\u003d");
}

export function bytes(text: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(text);
}

/** Invented 11-character video IDs: vid0000001a, vid0000002a, ... */
export function fakeId(n: number): string {
  return `vid${String(n).padStart(7, "0")}a`;
}

// ---- A sparse "multi-GB" archive -------------------------------------------------------

interface Segment {
  at: number;
  data: Uint8Array;
}

/** A huge virtual file: zeros except for the given segments. Records every read. */
export class SparseSource implements ByteSource {
  readonly reads: [number, number][] = [];

  constructor(
    readonly size: number,
    private readonly segments: readonly Segment[],
    private readonly maxRead = 8 << 20,
  ) {}

  get bytesRead(): number {
    return this.reads.reduce((sum, [a, b]) => sum + (b - a), 0);
  }

  slice(start = 0, end = this.size): Blob {
    end = Math.min(end, this.size);
    if (end - start > this.maxRead) throw new Error(`Refusing to read ${end - start} bytes at once`);
    this.reads.push([start, end]);
    const out = new Uint8Array(Math.max(0, end - start));
    for (const s of this.segments) {
      const from = Math.max(start, s.at);
      const to = Math.min(end, s.at + s.data.length);
      if (from < to) out.set(s.data.subarray(from - s.at, to - s.at), from - start);
    }
    return new Blob([out]);
  }
}

export interface Zip64Item {
  name: string;
  /** Real content; or leave it out and give `virtualSize` for a stored entry of zeros. */
  data?: Uint8Array;
  virtualSize?: number;
  /** 0 stored, 8 deflate (data must then be raw-deflated already). */
  method?: 0 | 8;
  uncompressedSize?: number;
}

/**
 * A hand-built ZIP64 archive (every size and offset in ZIP64 extra fields, ZIP64 end records),
 * laid out as a sparse file so that entries can sit beyond 4 GB without allocating anything.
 */
export function sparseZip64(items: readonly Zip64Item[]): SparseSource {
  const enc = new TextEncoder();
  const segments: Segment[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const item of items) {
    const name = enc.encode(item.name);
    const compressed = item.data?.length ?? item.virtualSize ?? 0;
    const size = item.uncompressedSize ?? compressed;
    const local = new Uint8Array(30 + name.length + 20);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 45, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, item.method ?? 0, true);
    lv.setUint32(18, 0xffffffff, true);
    lv.setUint32(22, 0xffffffff, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 20, true);
    local.set(name, 30);
    lv.setUint16(30 + name.length, 0x0001, true);
    lv.setUint16(32 + name.length, 16, true);
    lv.setBigUint64(34 + name.length, BigInt(size), true);
    lv.setBigUint64(42 + name.length, BigInt(compressed), true);
    segments.push({ at: offset, data: local });
    if (item.data) segments.push({ at: offset + local.length, data: item.data });

    const cd = new Uint8Array(46 + name.length + 28);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 45, true);
    cv.setUint16(6, 45, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, item.method ?? 0, true);
    cv.setUint32(20, 0xffffffff, true);
    cv.setUint32(24, 0xffffffff, true);
    cv.setUint16(28, name.length, true);
    cv.setUint16(30, 28, true);
    cv.setUint32(42, 0xffffffff, true);
    cd.set(name, 46);
    const x = 46 + name.length;
    cv.setUint16(x, 0x0001, true);
    cv.setUint16(x + 2, 24, true);
    cv.setBigUint64(x + 4, BigInt(size), true);
    cv.setBigUint64(x + 12, BigInt(compressed), true);
    cv.setBigUint64(x + 20, BigInt(offset), true);
    central.push(cd);
    offset += local.length + compressed;
  }
  const cdOffset = offset;
  const cdSize = central.reduce((sum, c) => sum + c.length, 0);
  const tail = new Uint8Array(cdSize + 56 + 20 + 22);
  let p = 0;
  for (const c of central) {
    tail.set(c, p);
    p += c.length;
  }
  const tv = new DataView(tail.buffer);
  const zip64At = cdOffset + cdSize;
  tv.setUint32(p, 0x06064b50, true);
  tv.setBigUint64(p + 4, 44n, true);
  tv.setUint16(p + 12, 45, true);
  tv.setUint16(p + 14, 45, true);
  tv.setBigUint64(p + 24, BigInt(items.length), true);
  tv.setBigUint64(p + 32, BigInt(items.length), true);
  tv.setBigUint64(p + 40, BigInt(cdSize), true);
  tv.setBigUint64(p + 48, BigInt(cdOffset), true);
  p += 56;
  tv.setUint32(p, 0x07064b50, true);
  tv.setBigUint64(p + 8, BigInt(zip64At), true);
  tv.setUint32(p + 16, 1, true);
  p += 20;
  tv.setUint32(p, 0x06054b50, true);
  tv.setUint16(p + 8, 0xffff, true);
  tv.setUint16(p + 10, 0xffff, true);
  tv.setUint32(p + 12, 0xffffffff, true);
  tv.setUint32(p + 16, 0xffffffff, true);
  segments.push({ at: cdOffset, data: tail });
  return new SparseSource(cdOffset + tail.length, segments);
}
