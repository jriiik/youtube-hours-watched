import { parseTakeoutDate } from "./dates";
import { emptySkipCounts, isAdMarker, isMusicUrl, isPostUrl, videoIdFromUrl } from "./history";
import type { ParsedHistory, SkipCounts, WatchEntry } from "./history";
import { decodeEntities } from "./htmlEntities";

// Each history item is one <div class="outer-cell ..."> block: a header cell ("YouTube" or
// "YouTube Music"), a body cell ("Watched <a>title</a><br><a>channel</a><br>date<br>") and a
// caption cell (products, "From Google Ads" for ads, why it's there). Plain string searches
// are used instead of a DOM parser: histories run to tens of MB.
const BLOCK = '<div class="outer-cell';
const HEADER_CELL = 'mdl-typography--title">';
const BODY_CELL = 'mdl-typography--body-1">';
const CAPTION_CELL = 'mdl-typography--caption">';
const NBSP = /\u00a0/g;

interface Link {
  href: string;
  text: string;
}

function linksIn(body: string): Link[] {
  const links: Link[] = [];
  let at = 0;
  for (;;) {
    const open = body.indexOf('<a href="', at);
    if (open < 0) break;
    const hrefStart = open + 9;
    const hrefEnd = body.indexOf('"', hrefStart);
    const textStart = hrefEnd < 0 ? -1 : body.indexOf(">", hrefEnd) + 1;
    const textEnd = textStart <= 0 ? -1 : body.indexOf("</a>", textStart);
    if (textEnd < 0) break;
    links.push({ href: body.slice(hrefStart, hrefEnd), text: body.slice(textStart, textEnd) });
    at = textEnd + 4;
  }
  return links;
}

function cleanText(html: string): string {
  return decodeEntities(html).replace(NBSP, " ").trim();
}

/** The last non-empty <br>-separated segment of the body cell: the date. */
function lastSegment(body: string): string {
  let end = body.length;
  while (end > 0) {
    const br = end >= 4 ? body.lastIndexOf("<br>", end - 4) : -1;
    const segment = cleanText(body.slice(br < 0 ? 0 : br + 4, end));
    if (segment) return segment;
    if (br < 0) break;
    end = br;
  }
  return "";
}

/** Streaming parser: push decoded text as it arrives, then call finish(). */
export class HtmlHistoryParser {
  private buffer = "";
  private started = false;
  private items = 0;
  private readonly entries: WatchEntry[] = [];
  private readonly skipped: SkipCounts = emptySkipCounts();
  private readonly unknownZones: Record<string, number> = {};

  /** Watched videos found so far. */
  get found(): number {
    return this.entries.length;
  }

  push(text: string): void {
    if (!text) return;
    let buf = this.buffer + text;
    if (!this.started) {
      const first = buf.indexOf(BLOCK);
      if (first < 0) {
        // Still in the page head; keep enough to catch a marker split across chunks.
        this.buffer = buf.slice(-(BLOCK.length - 1));
        return;
      }
      this.started = true;
      buf = buf.slice(first);
    }
    let start = 0;
    for (;;) {
      const next = buf.indexOf(BLOCK, start + BLOCK.length);
      if (next < 0) break;
      this.parseBlock(buf.slice(start, next));
      start = next;
    }
    this.buffer = start ? buf.slice(start) : buf;
  }

  finish(): ParsedHistory {
    if (this.started && this.buffer) this.parseBlock(this.buffer);
    this.buffer = "";
    this.started = false;
    return {
      format: "html",
      entries: this.entries,
      items: this.items,
      skipped: this.skipped,
      unknownZones: this.unknownZones,
    };
  }

  private parseBlock(block: string): void {
    this.items++;
    const bodyAt = block.indexOf(BODY_CELL);
    if (bodyAt < 0) {
      this.skipped.other++;
      return;
    }
    const bodyStart = bodyAt + BODY_CELL.length;
    let bodyEnd = block.indexOf("</div>", bodyStart);
    if (bodyEnd < 0) bodyEnd = block.length;
    const body = block.slice(bodyStart, bodyEnd);
    const links = linksIn(body);
    const videoHref = links.length ? decodeEntities(links[0].href) : "";
    const videoId = videoHref ? videoIdFromUrl(videoHref) : null;
    if (!videoId) {
      if (isPostUrl(videoHref)) this.skipped.posts++;
      else this.skipped.other++;
      return;
    }
    const captionAt = block.indexOf(CAPTION_CELL, bodyEnd);
    if (captionAt >= 0) {
      const captionEnd = block.indexOf("</div>", captionAt);
      if (isAdMarker(block.slice(captionAt, captionEnd < 0 ? block.length : captionEnd))) {
        this.skipped.ads++;
        return;
      }
    }
    const date = parseTakeoutDate(lastSegment(body));
    if (!date) {
      this.skipped.unparsedDates++;
      return;
    }
    if (date.zoneUnknown) this.unknownZones[date.zone] = (this.unknownZones[date.zone] ?? 0) + 1;
    const headerAt = block.indexOf(HEADER_CELL);
    let header = "";
    if (headerAt >= 0 && headerAt < bodyAt) {
      const start = headerAt + HEADER_CELL.length;
      header = cleanText(block.slice(start, block.indexOf("<", start)));
    }
    const channel = links[1];
    this.entries.push({
      videoId,
      title: cleanText(links[0].text),
      channel: channel ? cleanText(channel.text) : "",
      channelUrl: channel ? decodeEntities(channel.href) : "",
      music: header === "YouTube Music" || isMusicUrl(videoHref),
      utcMs: date.localMs - date.offsetMin * 60_000,
      localMs: date.localMs,
    });
  }
}

/** Parses a whole watch-history.html. */
export function parseHtmlHistory(html: string): ParsedHistory {
  const parser = new HtmlHistoryParser();
  parser.push(html);
  return parser.finish();
}
