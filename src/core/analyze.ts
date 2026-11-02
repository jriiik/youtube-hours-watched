import { abortError, throwIfAborted } from "./errors";
import { runAnalysis } from "./pipeline";
import type { AnalyzeOptions, AnalyzeResult } from "./types";
import { deserializeError } from "./workerMessages";
import type { WorkerReply, WorkerRequest } from "./workerMessages";

export { AnalysisError } from "./errors";
export type { AnalysisErrorReason } from "./errors";

function startWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  try {
    return new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  } catch {
    return null;
  }
}

/**
 * Reads a Takeout export (watch-history.html, watch-history.json or a Takeout .zip), looks up
 * video lengths and computes the dashboard. Runs in a Web Worker, or on this thread where
 * workers are unavailable. Rejects with an AnalysisError (plain-language message plus a
 * `reason`, e.g. "invalid" for a bad API key) or, when `signal` aborts, an AbortError.
 */
export async function analyzeHistory(file: Blob & { name?: string }, opts: AnalyzeOptions): Promise<AnalyzeResult> {
  throwIfAborted(opts.signal);
  const worker = startWorker();
  if (!worker) return runAnalysis(file, opts);
  return new Promise<AnalyzeResult>((resolve, reject) => {
    let heard = false;
    const stop = () => {
      worker.terminate();
      opts.signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      stop();
      reject(abortError(opts.signal));
    };
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      heard = true;
      const message = event.data;
      if (message.type === "progress") {
        opts.onProgress?.(message.progress);
      } else if (message.type === "result") {
        stop();
        resolve(message.result);
      } else {
        stop();
        reject(deserializeError(message.error));
      }
    };
    worker.onerror = (event) => {
      event.preventDefault();
      stop();
      // A worker that never started (blocked or failed to load) falls back to this thread.
      if (!heard) runAnalysis(file, opts).then(resolve, reject);
      else reject(new Error(event.message || "The analysis stopped unexpectedly. Please try again."));
    };
    worker.onmessageerror = () => {
      stop();
      reject(new Error("The analysis stopped unexpectedly. Please try again."));
    };
    const request: WorkerRequest = { file, apiKey: opts.apiKey };
    worker.postMessage(request);
  });
}
