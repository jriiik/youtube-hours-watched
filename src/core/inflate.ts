import { Inflate } from "fflate";

export type Inflater = (input: AsyncIterable<Uint8Array>) => AsyncGenerator<Uint8Array>;

function nativeAvailable(): boolean {
  try {
    new DecompressionStream("deflate-raw");
    return true;
  } catch {
    return false;
  }
}

/** Raw DEFLATE with the platform's DecompressionStream (fast, native). */
export async function* inflateRawNative(input: AsyncIterable<Uint8Array>): AsyncGenerator<Uint8Array> {
  const stream = new DecompressionStream("deflate-raw");
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  let inputError: unknown = null;
  const pump = (async () => {
    try {
      for await (const chunk of input) await writer.write(chunk as Uint8Array<ArrayBuffer>);
      await writer.close();
    } catch (err) {
      inputError ??= err;
      await writer.abort(err).catch(() => {});
    }
  })();
  try {
    for (;;) {
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await reader.read();
      } catch (err) {
        throw inputError ?? err;
      }
      if (result.done) break;
      yield result.value;
    }
    await pump;
    if (inputError) throw inputError;
  } finally {
    // Stopping early (enough bytes for a sniff) cancels the stream, which also ends the pump.
    await reader.cancel().catch(() => {});
  }
}

/** Raw DEFLATE in JavaScript (fflate), for platforms without "deflate-raw" streams. */
export async function* inflateRawFflate(input: AsyncIterable<Uint8Array>): AsyncGenerator<Uint8Array> {
  const out: Uint8Array[] = [];
  const inflater = new Inflate((data) => {
    if (data.length) out.push(data);
  });
  for await (const chunk of input) {
    inflater.push(chunk, false);
    while (out.length) yield out.shift()!;
  }
  inflater.push(new Uint8Array(0), true);
  while (out.length) yield out.shift()!;
}

let preferred: Inflater | null = null;

/** Native when available, otherwise fflate. */
export function inflateRaw(input: AsyncIterable<Uint8Array>): AsyncGenerator<Uint8Array> {
  preferred ??= nativeAvailable() ? inflateRawNative : inflateRawFflate;
  return preferred(input);
}
