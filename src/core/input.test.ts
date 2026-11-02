import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { bytes, fakeId, htmlEntry, jsonEntry, takeoutHtml, takeoutJson } from "./__fixtures__/takeout";
import { openHistorySource, readHistory, sniffWatchHistory } from "./input";
import type { Progress } from "./types";

const historyHtml = takeoutHtml([
  htmlEntry({ videoId: fakeId(2), date: "30 Oct 2026, 11:41:27 CET" }),
  htmlEntry({ videoId: fakeId(1), date: "30 Oct 2026, 11:03:52 CET" }),
]);
const searchHtml = takeoutHtml(
  Array.from({ length: 400 }, (_, i) =>
    htmlEntry({ verb: "Searched for", href: `https://www.youtube.com/results?search_query=query+${i}`, title: `query ${i}`, channel: null, date: "30 Oct 2026, 11:41:27 CET" }),
  ),
);
const historyJson = takeoutJson([jsonEntry({ videoId: fakeId(1), time: "2026-10-30T10:41:27Z" })]);

describe("sniffWatchHistory", () => {
  it("recognises watch histories, not search histories", () => {
    expect(sniffWatchHistory(historyHtml)).toBe("html");
    expect(sniffWatchHistory(`\ufeff  ${historyJson}`)).toBe("json");
    expect(sniffWatchHistory(searchHtml)).toBeNull();
    expect(sniffWatchHistory("hello /watch?v=")).toBeNull();
  });
});

describe("openHistorySource", () => {
  it("opens plain HTML and JSON files", async () => {
    const html = await openHistorySource(new File([historyHtml], "my-history.html"));
    expect(html).toMatchObject({ format: "html", name: "my-history.html", size: historyHtml.length });
    const json = await openHistorySource(new Blob([`\ufeff\n  ${historyJson}`]));
    expect(json).toMatchObject({ format: "json", name: "watch-history.json" });
  });

  it("finds watch-history.html inside a Takeout zip", async () => {
    const zip = zipSync({
      "Takeout/archive_browser.html": bytes("<html>index</html>"),
      "Takeout/YouTube and YouTube Music/history/search-history.html": bytes(searchHtml),
      "Takeout/YouTube and YouTube Music/history/watch-history.html": bytes(historyHtml),
    });
    const source = await openHistorySource(new File([zip], "takeout-20261030T101010Z-001.zip"));
    expect(source).toMatchObject({ format: "html", name: "watch-history.html" });
    expect(source.size).toBeLessThan(zip.length);
  });

  it("prefers the JSON history when both formats were exported", async () => {
    const zip = zipSync({
      "Takeout/YouTube and YouTube Music/history/watch-history.html": bytes(historyHtml),
      "Takeout/YouTube and YouTube Music/history/watch-history.json": bytes(historyJson),
    });
    expect((await openHistorySource(new Blob([zip]))).format).toBe("json");
  });

  it("finds My Activity's YouTube history, and takes the bigger history when both were exported", async () => {
    const myActivity = takeoutJson([
      jsonEntry({ videoId: fakeId(2), time: "2026-10-30T10:41:27Z" }),
      { header: "YouTube", title: "Searched for ftl", titleUrl: "https://www.youtube.com/results?search_query=ftl", time: "2026-10-30T10:10:00Z" },
      jsonEntry({ videoId: fakeId(1), time: "2017-10-04T20:17:00Z" }),
    ]);
    // Every product's activity file is called MyActivity; only YouTube's is a watch history.
    const search = takeoutJson([{ header: "Search", title: "Searched for ftl", titleUrl: "https://www.google.com/search?q=ftl", time: "2026-10-30T10:00:00Z" }]);
    const onlyMyActivity = zipSync({
      "Takeout/My Activity/Search/MyActivity.json": bytes(search + " ".repeat(5000)),
      "Takeout/My Activity/YouTube/MyActivity.json": bytes(myActivity),
    });
    expect(await openHistorySource(new Blob([onlyMyActivity]))).toMatchObject({ format: "json", name: "MyActivity.json" });
    expect((await readHistory(new Blob([onlyMyActivity]))).parsed.entries.map((e) => e.videoId)).toEqual([fakeId(2), fakeId(1)]);

    // Takeout's YouTube export can stop years short of My Activity's.
    const both = zipSync({
      "Takeout/My Activity/YouTube/MyActivity.json": bytes(myActivity),
      "Takeout/YouTube and YouTube Music/history/watch-history.json": bytes(historyJson),
    });
    expect((await openHistorySource(new Blob([both]))).name).toBe("MyActivity.json");
    const bigger = zipSync({
      "Takeout/My Activity/YouTube/MyActivity.json": bytes(historyJson),
      "Takeout/YouTube and YouTube Music/history/watch-history.json": bytes(myActivity),
    });
    expect((await openHistorySource(new Blob([bigger]))).name).toBe("watch-history.json");
  });

  it("recognises translated file names by their content", async () => {
    const zip = zipSync({
      "Takeout/Fotos/Album/notes.html": bytes(historyHtml), // not in a YouTube folder: ignored
      "Takeout/YouTube und YouTube Music/Verlauf/Suchverlauf.html": bytes(searchHtml),
      "Takeout/YouTube und YouTube Music/Verlauf/Wiedergabeverlauf.html": bytes(historyHtml),
    });
    expect(await openHistorySource(new Blob([zip]))).toMatchObject({ format: "html", name: "Wiedergabeverlauf.html" });
  });

  it("explains files it can't use", async () => {
    const noHistory = zipSync({ "Takeout/Drive/notes.txt": bytes("hello") });
    await expect(openHistorySource(new Blob([noHistory]))).rejects.toMatchObject({ reason: "not-history", message: expect.stringContaining("several .zip files") });
    await expect(openHistorySource(new Blob([new Uint8Array([0x1f, 0x8b, 8, 0])]))).rejects.toMatchObject({ message: expect.stringContaining(".tgz") });
    await expect(openHistorySource(new Blob(["just some text"]))).rejects.toMatchObject({ reason: "not-history" });
  });
});

describe("readHistory", () => {
  it("reads and parses a zipped history, reporting the bytes read", async () => {
    const zip = zipSync({ "Takeout/YouTube and YouTube Music/history/watch-history.html": [bytes(historyHtml), { level: 9 }] });
    const progress: Progress[] = [];
    const { parsed, source } = await readHistory(new Blob([zip]), { onProgress: (p) => progress.push(p) });
    expect(parsed.entries.map((e) => e.videoId)).toEqual([fakeId(2), fakeId(1)]);
    expect(progress.every((p) => p.stage === "reading")).toBe(true);
    expect(progress[progress.length - 1]).toEqual({ stage: "reading", done: source.size, total: source.size, detail: "watch-history.html" });
  });

  it("refuses HTML that has no history items", async () => {
    await expect(readHistory(new Blob(["<html><body>Nothing here</body></html>"]))).rejects.toMatchObject({ reason: "not-history" });
  });
});
