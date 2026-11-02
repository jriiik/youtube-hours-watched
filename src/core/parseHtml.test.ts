import { describe, expect, it } from "vitest";
import { htmlEntry, htmlTextEntry, takeoutHtml } from "./__fixtures__/takeout";
import { HtmlHistoryParser, parseHtmlHistory } from "./parseHtml";

const local = (iso: string) => Date.parse(`${iso}Z`);

const sample = takeoutHtml([
  htmlEntry({
    videoId: "vid0000001a",
    title: "Tom &amp; Jerry&#39;s &quot;Best&quot; Bits",
    channel: "Cartoon &amp; Co  ",
    channelId: "UCcartoon",
    date: "30 Oct 2026, 11:41:27 CET",
  }),
  htmlEntry({ videoId: "vid0000002a", title: "An ad", channel: "Advertiser", date: "30 Oct 2026, 11:10:00 CET", ad: true }),
  htmlEntry({
    verb: "Viewed",
    href: "https://www.youtube.com/post/UgkxInvented",
    title: "A community post",
    date: "29 Oct 2026, 20:00:00 CET",
  }),
  htmlTextEntry(["Answered survey question", "Did you enjoy this video?", "Yes"], "29 Oct 2026, 19:00:00 CET"),
  // Deleted or private: only the video link, whose text is the URL itself.
  htmlEntry({ videoId: "vid0000003a", channel: null, date: "1 Sept 2026, 08:00:00 CET", space: "char" }),
  htmlEntry({ header: "YouTube Music", videoId: "vid0000004a", title: "A song", channel: "A band", date: "2 Sept 2026, 09:00:00 CET" }),
  // A title mentioning Google Ads is not an ad: only the caption says so.
  htmlEntry({ videoId: "vid0000005a", title: "How Google Ads work", date: "3 Sept 2026, 10:00:00 CET", space: "plain" }),
]);

describe("parseHtmlHistory", () => {
  it("reads watched videos from the real markup", () => {
    const parsed = parseHtmlHistory(sample);
    expect(parsed.format).toBe("html");
    expect(parsed.items).toBe(7);
    expect(parsed.entries.map((e) => e.videoId)).toEqual(["vid0000001a", "vid0000003a", "vid0000004a", "vid0000005a"]);
    expect(parsed.entries[0]).toEqual({
      videoId: "vid0000001a",
      title: 'Tom & Jerry\'s "Best" Bits',
      channel: "Cartoon & Co",
      channelUrl: "https://www.youtube.com/channel/UCcartoon",
      music: false,
      localMs: local("2026-10-30T11:41:27"),
      utcMs: local("2026-10-30T10:41:27"),
    });
  });

  it("counts what it skips", () => {
    expect(parseHtmlHistory(sample).skipped).toEqual({ ads: 1, posts: 1, searches: 0, other: 1, unparsedDates: 0 });
  });

  it("counts searches, which My Activity exports list along with what was watched", () => {
    const parsed = parseHtmlHistory(
      takeoutHtml([
        htmlEntry({ videoId: "vid0000001a", date: "30 Oct 2026, 11:41:27 CET" }),
        htmlEntry({ verb: "Searched for", href: "https://www.youtube.com/results?search_query=ftl+guide", title: "ftl guide", channel: null, date: "30 Oct 2026, 11:10:00 CET" }),
      ]),
    );
    expect(parsed.entries.map((e) => e.videoId)).toEqual(["vid0000001a"]);
    expect(parsed.skipped).toMatchObject({ searches: 1, other: 0 });
  });

  it("keeps one-link entries (deleted or private videos) without a channel", () => {
    const deleted = parseHtmlHistory(sample).entries[1];
    expect(deleted).toMatchObject({ videoId: "vid0000003a", channel: "", channelUrl: "", localMs: local("2026-09-01T08:00:00") });
    expect(deleted.title).toBe("https://www.youtube.com/watch?v=vid0000003a");
  });

  it("marks YouTube Music entries", () => {
    const entries = parseHtmlHistory(sample).entries;
    expect(entries.map((e) => e.music)).toEqual([false, false, true, false]);
  });

  it("does not depend on the English verb", () => {
    const parsed = parseHtmlHistory(takeoutHtml([htmlEntry({ verb: "Angesehen", videoId: "vid0000001a", date: "30.10.2026, 11:41:27 MEZ" })]));
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].utcMs).toBe(local("2026-10-30T10:41:27"));
  });

  it("reads en-US dates with a narrow no-break space", () => {
    const parsed = parseHtmlHistory(takeoutHtml([htmlEntry({ videoId: "vid0000001a", date: "Oct 30, 2026, 11:41:27\u202fPM EDT" })]));
    expect(parsed.entries[0]).toMatchObject({ localMs: local("2026-10-30T23:41:27"), utcMs: local("2026-10-31T03:41:27") });
  });

  it("counts unreadable dates and unknown zones", () => {
    const parsed = parseHtmlHistory(
      takeoutHtml([
        htmlEntry({ videoId: "vid0000001a", date: "sometime last week" }),
        htmlEntry({ videoId: "vid0000002a", date: "30 Oct 2026, 11:41:27 XYZ" }),
        htmlEntry({ videoId: "vid0000003a", date: "30 Oct 2026, 11:15:52 XYZ" }),
      ]),
    );
    expect(parsed.skipped.unparsedDates).toBe(1);
    expect(parsed.unknownZones).toEqual({ XYZ: 2 });
    expect(parsed.entries[0].utcMs).toBe(parsed.entries[0].localMs);
  });

  it("accepts other video link shapes", () => {
    const parsed = parseHtmlHistory(
      takeoutHtml([
        htmlEntry({ href: "https://www.youtube.com/watch?app=desktop&amp;v=vid0000001a&amp;t=10s", date: "30 Oct 2026, 11:41:27 CET" }),
        htmlEntry({ href: "https://youtu.be/vid0000002a", date: "30 Oct 2026, 11:41:27 CET" }),
        htmlEntry({ href: "https://www.youtube.com/shorts/vid0000003a", date: "30 Oct 2026, 11:41:27 CET" }),
        htmlEntry({ href: "https://www.youtube.com/watch?v=tooShort", date: "30 Oct 2026, 11:41:27 CET" }),
        htmlEntry({ href: "https://www.youtube.com/watch?v=vid0000004aTooLong", date: "30 Oct 2026, 11:41:27 CET" }),
      ]),
    );
    expect(parsed.entries.map((e) => e.videoId)).toEqual(["vid0000001a", "vid0000002a", "vid0000003a"]);
    expect(parsed.skipped.other).toBe(2);
  });

  it("finds nothing in other HTML", () => {
    expect(parseHtmlHistory("<html><body><p>Hello</p></body></html>")).toMatchObject({ items: 0, entries: [] });
  });
});

describe("HtmlHistoryParser (streaming)", () => {
  it("gives the same result however the text is split", () => {
    const whole = parseHtmlHistory(sample);
    for (const size of [1, 7, 23, 100, 4096]) {
      const parser = new HtmlHistoryParser();
      for (let i = 0; i < sample.length; i += size) parser.push(sample.slice(i, i + size));
      expect(parser.found).toBe(3); // the last block is only complete at the end
      expect(parser.finish()).toEqual(whole);
      expect(parser.found).toBe(4);
    }
  });
});
