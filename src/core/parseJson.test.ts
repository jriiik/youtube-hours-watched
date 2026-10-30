import { describe, expect, it } from "vitest";
import { fakeId, jsonEntry, takeoutJson } from "./__fixtures__/takeout";
import { AnalysisError } from "./errors";
import { parseJsonHistory } from "./parseJson";

const localOf = (utcMs: number) => {
  const d = new Date(utcMs);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
};

describe("parseJsonHistory", () => {
  const text = takeoutJson([
    jsonEntry({ videoId: "vid0000001a", title: "First video", channel: " A channel ", time: "2026-10-30T10:13:52.123Z" }),
    jsonEntry({ videoId: "vid0000002a", title: "An ad", time: "2026-10-30T10:10:00Z", ad: true }),
    jsonEntry({ verb: "Viewed", titleUrl: "https://www.youtube.com/post/UgkxInvented", title: "A post", time: "2026-10-29T10:00:00Z" }),
    jsonEntry({ titleUrl: null, time: "2026-10-29T09:00:00Z", channel: null }),
    jsonEntry({ videoId: "vid0000003a", channel: null, time: "2026-10-28T09:00:00Z" }),
    jsonEntry({
      header: "YouTube Music",
      titleUrl: "https://music.youtube.com/watch?v=vid0000004a",
      title: "A song",
      time: "2026-10-27T09:00:00Z",
    }),
    jsonEntry({ videoId: "vid0000005a", time: "not a date" }),
  ]);

  it("reads watched videos (Google escapes = as \\u003d)", () => {
    expect(text).toContain("watch?v\\u003dvid0000001a");
    const parsed = parseJsonHistory(text);
    expect(parsed.format).toBe("json");
    expect(parsed.items).toBe(7);
    expect(parsed.entries.map((e) => e.videoId)).toEqual(["vid0000001a", "vid0000003a", "vid0000004a"]);
    const utcMs = Date.parse("2026-10-30T10:13:52.123Z");
    expect(parsed.entries[0]).toEqual({
      videoId: "vid0000001a",
      title: "First video",
      channel: "A channel",
      channelUrl: "https://www.youtube.com/channel/UCchannel000000000000001",
      music: false,
      utcMs,
      localMs: localOf(utcMs),
    });
    expect(parsed.entries[1]).toMatchObject({ channel: "", channelUrl: "", title: "https://www.youtube.com/watch?v=vid0000003a" });
    expect(parsed.entries[2]).toMatchObject({ music: true, title: "A song" });
    expect(parsed.skipped).toEqual({ ads: 1, posts: 1, other: 1, unparsedDates: 1 });
  });

  it("removes a translated verb, learnt from a deleted video's title", () => {
    const items = [
      jsonEntry({ verb: "Visto", videoId: fakeId(1), title: "Primer vídeo", time: "2026-10-30T10:00:00Z" }),
      jsonEntry({ verb: "Visto", videoId: fakeId(2), channel: null, time: "2026-10-30T09:00:00Z" }),
    ];
    expect(parseJsonHistory(JSON.stringify(items)).entries[0].title).toBe("Primer vídeo");
  });

  it("removes a common translated verb in longer histories", () => {
    const items = Array.from({ length: 25 }, (_, i) =>
      jsonEntry({ verb: "Vous avez regardé", videoId: fakeId(i), title: `Vidéo ${i}`, time: `2026-10-${String(i + 1).padStart(2, "0")}T10:00:00Z` }),
    );
    expect(parseJsonHistory(JSON.stringify(items)).entries.map((e) => e.title)).toEqual(items.map((_, i) => `Vidéo ${i}`));
  });

  it("recognises ads in Japanese histories, where Google Ads is Google 広告", () => {
    const items = [
      { header: "YouTube", title: "広告を視聴しました", titleUrl: `https://www.youtube.com/watch?v=${fakeId(1)}`, time: "2026-10-30T10:00:00Z", details: [{ name: "Google 広告から" }] },
      jsonEntry({ videoId: fakeId(2), time: "2026-10-30T09:00:00Z" }),
    ];
    expect(parseJsonHistory(JSON.stringify(items))).toMatchObject({ entries: [{ videoId: fakeId(2) }], skipped: { ads: 1 } });
  });

  it("refuses files that are not a history", () => {
    expect(() => parseJsonHistory("{not json")).toThrow(AnalysisError);
    expect(() => parseJsonHistory('{"a": 1}')).toThrow(AnalysisError);
    expect(parseJsonHistory("[]")).toMatchObject({ items: 0, entries: [] });
  });
});
