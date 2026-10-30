import { AnalysisError, throwIfAborted } from "./errors";
import { inflateRaw } from "./inflate";
import type { Inflater } from "./inflate";

// A lazy .zip reader over Blob.slice(): it reads the central directory at the end of the file
// and then only the bytes of the entry it is asked for. Takeout archives can be many GB
// (with ZIP64 records), so the archive itself is never loaded whole.

/** The part of Blob the readers need; lets tests stand in for multi-GB files. */
export interface ByteSource {
  readonly size: number;
  slice(start?: number, end?: number): Blob;
}

export interface ZipEntry {
  name: string;
  /** 0 = stored, 8 = deflate. */
  method: number;
  flags: number;
  compressedSize: number;
  /** Uncompressed size. */
  size: number;
  localHeaderOffset: number;
}

const EOCD = 0x06054b50;
const ZIP64_LOCATOR = 0x07064b50;
const ZIP64_EOCD = 0x06064b50;
const CENTRAL_HEADER = 0x02014b50;
const LOCAL_HEADER = 0x04034b50;
const MAX_COMMENT = 0xffff;
export const READ_CHUNK = 1 << 20;

const damaged = (detail: string) =>
  new AnalysisError("bad-zip", `This .zip file seems incomplete or damaged (${detail}). Try downloading it again.`);

export async function readBytes(src: ByteSource, start: number, end: number): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await src.slice(start, end).arrayBuffer());
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function u64(dv: DataView, at: number): number {
  return Number(dv.getBigUint64(at, true));
}

export function isZipSignature(head: Uint8Array): boolean {
  return head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b && (head[2] === 3 || head[2] === 5) && (head[3] === 4 || head[3] === 6);
}

/** Lists the archive's entries from its central directory (ZIP64 aware). */
export async function listZipEntries(src: ByteSource): Promise<ZipEntry[]> {
  const tailStart = Math.max(0, src.size - (22 + MAX_COMMENT));
  const tail = await readBytes(src, tailStart, src.size);
  const tv = view(tail);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tv.getUint32(i, true) === EOCD && i + 22 + tv.getUint16(i + 20, true) <= tail.length) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw damaged("its table of contents is missing");
  if (tv.getUint16(eocd + 4, true) !== 0 && tv.getUint16(eocd + 4, true) !== 0xffff) {
    throw new AnalysisError("bad-zip", "Split (multi-part) .zip archives aren't supported.");
  }
  let cdSize = tv.getUint32(eocd + 12, true);
  let cdOffset = tv.getUint32(eocd + 16, true);

  // ZIP64: a locator just before the end record points to a 64-bit end record.
  const locatorAt = tailStart + eocd - 20;
  if (locatorAt >= 0) {
    const locator = locatorAt >= tailStart ? tail.subarray(eocd - 20, eocd) : await readBytes(src, locatorAt, locatorAt + 20);
    const lv = view(locator);
    if (lv.getUint32(0, true) === ZIP64_LOCATOR) {
      const recordAt = u64(lv, 8);
      const record = view(await readBytes(src, recordAt, recordAt + 56));
      if (record.byteLength < 56 || record.getUint32(0, true) !== ZIP64_EOCD) throw damaged("bad ZIP64 record");
      cdSize = u64(record, 40);
      cdOffset = u64(record, 48);
    }
  }
  if (cdOffset + cdSize > src.size) throw damaged("its table of contents points past the end");

  const cd = await readBytes(src, cdOffset, cdOffset + cdSize);
  const dv = view(cd);
  const names = new TextDecoder();
  const entries: ZipEntry[] = [];
  let p = 0;
  while (p + 46 <= cd.length && dv.getUint32(p, true) === CENTRAL_HEADER) {
    const nameLength = dv.getUint16(p + 28, true);
    const extraLength = dv.getUint16(p + 30, true);
    const commentLength = dv.getUint16(p + 32, true);
    let compressedSize = dv.getUint32(p + 20, true);
    let size = dv.getUint32(p + 24, true);
    let localHeaderOffset = dv.getUint32(p + 42, true);
    const nameEnd = p + 46 + nameLength;
    const extraEnd = nameEnd + extraLength;
    if (extraEnd > cd.length) throw damaged("truncated table of contents");
    // ZIP64 extended information: 64-bit values for the fields set to 0xFFFFFFFF, in this order.
    for (let x = nameEnd; x + 4 <= extraEnd; ) {
      const id = dv.getUint16(x, true);
      const length = dv.getUint16(x + 2, true);
      if (id === 0x0001) {
        let q = x + 4;
        const end = Math.min(q + length, extraEnd);
        if (size === 0xffffffff && q + 8 <= end) {
          size = u64(dv, q);
          q += 8;
        }
        if (compressedSize === 0xffffffff && q + 8 <= end) {
          compressedSize = u64(dv, q);
          q += 8;
        }
        if (localHeaderOffset === 0xffffffff && q + 8 <= end) localHeaderOffset = u64(dv, q);
      }
      x += 4 + length;
    }
    entries.push({
      name: names.decode(cd.subarray(p + 46, nameEnd)),
      method: dv.getUint16(p + 10, true),
      flags: dv.getUint16(p + 8, true),
      compressedSize,
      size,
      localHeaderOffset,
    });
    p = extraEnd + commentLength;
  }
  return entries;
}

export interface ReadOptions {
  chunkSize?: number;
  signal?: AbortSignal;
  /** Called with the number of bytes read from the source so far. */
  onRead?: (bytes: number) => void;
}

/** Reads [start, end) of a source in chunks. */
export async function* readRange(src: ByteSource, start: number, end: number, opts: ReadOptions = {}): AsyncGenerator<Uint8Array<ArrayBuffer>> {
  const chunk = opts.chunkSize ?? READ_CHUNK;
  for (let at = start; at < end; ) {
    throwIfAborted(opts.signal);
    const next = Math.min(end, at + chunk);
    const bytes = await readBytes(src, at, next);
    if (bytes.length !== next - at) throw damaged("it ends early");
    at = next;
    opts.onRead?.(at - start);
    yield bytes;
  }
}

/** The uncompressed bytes of one entry, read and inflated chunk by chunk. */
export async function* readZipEntry(
  src: ByteSource,
  entry: ZipEntry,
  opts: ReadOptions & { inflate?: Inflater } = {},
): AsyncGenerator<Uint8Array> {
  if (entry.flags & 1) throw new AnalysisError("bad-zip", "This .zip file is password-protected, so it can't be read.");
  if (entry.method !== 0 && entry.method !== 8) {
    throw new AnalysisError("bad-zip", `This .zip file uses a compression method this app can't read (method ${entry.method}).`);
  }
  const header = view(await readBytes(src, entry.localHeaderOffset, entry.localHeaderOffset + 30));
  if (header.byteLength < 30 || header.getUint32(0, true) !== LOCAL_HEADER) throw damaged("bad entry header");
  const dataStart = entry.localHeaderOffset + 30 + header.getUint16(26, true) + header.getUint16(28, true);
  const raw = readRange(src, dataStart, dataStart + entry.compressedSize, opts);
  if (entry.method === 0) {
    yield* raw;
    return;
  }
  try {
    yield* (opts.inflate ?? inflateRaw)(raw);
  } catch (err) {
    if (err instanceof AnalysisError || opts.signal?.aborted) throw err;
    throw damaged("its data can't be decompressed");
  }
}
