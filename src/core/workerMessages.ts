import { AnalysisError } from "./errors";
import type { AnalysisErrorReason } from "./errors";
import type { AnalyzeResult, Progress } from "./types";

// Messages between analyze.ts (interface thread) and worker.ts.

export interface WorkerRequest {
  file: Blob & { name?: string };
  apiKey: string;
}

export interface SerializedError {
  name: string;
  message: string;
  reason?: AnalysisErrorReason;
}

export type WorkerReply =
  | { type: "progress"; progress: Progress }
  | { type: "result"; result: AnalyzeResult }
  | { type: "error"; error: SerializedError };

export function serializeError(err: unknown): SerializedError {
  if (err instanceof AnalysisError) return { name: err.name, message: err.message, reason: err.reason };
  if (err instanceof Error || err instanceof DOMException) return { name: err.name, message: err.message };
  return { name: "Error", message: String(err) };
}

export function deserializeError(e: SerializedError): Error {
  if (e.reason) return new AnalysisError(e.reason, e.message);
  if (e.name === "AbortError") return new DOMException(e.message, "AbortError");
  const err = new Error(e.message);
  err.name = e.name;
  return err;
}
