import { deflateSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { bytes, fakeId, htmlEntry, sparseZip64, takeoutHtml } from "./__fixtures__/takeout";
import { AnalysisError } from "./errors";
import { inflateRawFflate, inflateRawNative } from "./inflate";
import { listZipEntries, readZipEntry } from "./zip";
import type { ByteSource, ZipEntry } from "./zip";

const HISTORY_PATH = "Takeout/YouTube and YouTube Music/history/watch-history.html";

/** Plain loop: Vitest's deep equality is very slow on megabyte arrays. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

async function collect(chunks: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  for await (const c of chunks) parts.push(c);
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** A history big enough to span many read chunks. */
function bigHistory(n: number): Uint8Array {
  const blocks = Array.from({ length: n }, (_, i) =>
    htmlEntry({ videoId: fakeId(i), title: `Video number ${i}`, channel: `Channel ${i % 37}`, date: "30 Oct 2026, 11:41:27 CET" }),
  );
  return bytes(takeoutHtml(blocks));
}

describe("listZipEntries / readZipEntry", () => {
  const history = bigHistory(3000);
  const readme = bytes("<html>Takeout index</html>");
  const archive = zipSync({
    "Takeout/archive_browser.html": [readme, { level: 0 }],
    [HISTORY_PATH]: [history, { level: 6 }],
    "Takeout/YouTube and YouTube Music/subscriptions/": [new Uint8Array(0), { level: 0 }],
  });
  const blob = new Blob([archive]);

  it("lists stored and deflated entries", async () => {
    const entries = await listZipEntries(blob);
    expect(entries.map((e) => [e.name, e.method, e.size])).toEqual([
      ["Takeout/archive_browser.html", 0, readme.length],
      [HISTORY_PATH, 8, history.length],
      ["Takeout/YouTube and YouTube Music/subscriptions/", 0, 0],
    ]);
    expect(entries[1].compressedSize).toBeLessThan(history.length / 4);
  });

  it("reads a stored entry", async () => {
    const [entry] = await listZipEntries(blob);
    expect(await collect(readZipEntry(blob, entry))).toEqual(readme);
  });

  it("inflates a deflated entry chunk by chunk, with both inflaters", async () => {
    const entry = (await listZipEntries(blob))[1];
    for (const inflate of [inflateRawNative, inflateRawFflate]) {
      const reads: number[] = [];
      const out = await collect(readZipEntry(blob, entry, { inflate, chunkSize: 4096, onRead: (n) => reads.push(n) }));
      expect(sameBytes(out, history)).toBe(true);
      expect(reads.length).toBeGreaterThan(2);
      expect(reads[reads.length - 1]).toBe(entry.compressedSize);
    }
  });

  it("can stop reading early", async () => {
    const entry = (await listZipEntries(blob))[1];
    for await (const chunk of readZipEntry(blob, entry, { chunkSize: 1024 })) {
      expect(chunk.length).toBeGreaterThan(0);
      break;
    }
  });
});

describe("ZIP64", () => {
  it("finds an entry past 4 GB without reading the rest of the archive", async () => {
    const history = bigHistory(200);
    const source = sparseZip64([
      { name: "Takeout/YouTube and YouTube Music/videos/holiday.mp4", virtualSize: 5 * 2 ** 30 },
      { name: HISTORY_PATH, data: deflateSync(history), method: 8, uncompressedSize: history.length },
    ]);
    expect(source.size).toBeGreaterThan(5 * 2 ** 30);
    const entries = await listZipEntries(source);
    expect(entries.map((e) => [e.name, e.size])).toEqual([
      ["Takeout/YouTube and YouTube Music/videos/holiday.mp4", 5 * 2 ** 30],
      [HISTORY_PATH, history.length],
    ]);
    expect(entries[1].localHeaderOffset).toBeGreaterThan(2 ** 32);
    expect(sameBytes(await collect(readZipEntry(source, entries[1])), history)).toBe(true);
    expect(source.bytesRead).toBeLessThan(200_000 + entries[1].compressedSize);
  });

  it("reads stored entries past 4 GB", async () => {
    const data = bytes("stored payload");
    const source = sparseZip64([
      { name: "big.bin", virtualSize: 4 * 2 ** 30 + 123 },
      { name: "small.txt", data },
    ]);
    const entries = await listZipEntries(source);
    expect(await collect(readZipEntry(source, entries[1]))).toEqual(data);
  });
});

describe("damaged archives", () => {
  const archive = zipSync({ [HISTORY_PATH]: [bytes(takeoutHtml([])), { level: 6 }] });

  it("rejects a file without a central directory", async () => {
    await expect(listZipEntries(new Blob([archive.slice(0, archive.length - 40)]))).rejects.toMatchObject({ reason: "bad-zip" });
    await expect(listZipEntries(new Blob([bytes("PK\u0003\u0004 not really a zip")]))).rejects.toBeInstanceOf(AnalysisError);
  });

  it("rejects encrypted entries and unknown compression methods", async () => {
    const blob = new Blob([archive]);
    const [entry] = await listZipEntries(blob);
    const encrypted: ZipEntry = { ...entry, flags: entry.flags | 1 };
    await expect(collect(readZipEntry(blob, encrypted))).rejects.toMatchObject({ reason: "bad-zip" });
    const bzip2: ZipEntry = { ...entry, method: 12 };
    await expect(collect(readZipEntry(blob, bzip2))).rejects.toMatchObject({ reason: "bad-zip" });
  });

  it("rejects data that doesn't inflate", async () => {
    const blob = new Blob([archive]);
    const [entry] = await listZipEntries(blob);
    const broken = archive.slice();
    // Overwrite the deflate data with an invalid block type (0b11).
    broken.fill(0xff, 30 + entry.name.length, 30 + entry.name.length + entry.compressedSize);
    const source: ByteSource = new Blob([broken]);
    for (const inflate of [inflateRawNative, inflateRawFflate]) {
      await expect(collect(readZipEntry(source, entry, { inflate }))).rejects.toMatchObject({ reason: "bad-zip" });
    }
  });
});
