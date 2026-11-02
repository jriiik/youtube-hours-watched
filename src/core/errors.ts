import type { ApiKeyProblem } from "./types";

export type AnalysisErrorReason =
  | ApiKeyProblem
  /** The file isn't a Takeout watch history (or a zip without one). */
  | "not-history"
  /** A watch history without any watched videos. */
  | "empty"
  /** None of the dates could be read (an unsupported account language). */
  | "dates"
  /** A damaged, encrypted or unsupported .zip file. */
  | "bad-zip";

/** An analysis failure with a plain-language message the interface can show as is. */
export class AnalysisError extends Error {
  readonly reason: AnalysisErrorReason;

  constructor(reason: AnalysisErrorReason, message: string) {
    super(message);
    this.name = "AnalysisError";
    this.reason = reason;
  }
}

export function abortError(signal?: AbortSignal): unknown {
  return signal?.reason ?? new DOMException("The analysis was cancelled.", "AbortError");
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError(signal);
}

export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}
