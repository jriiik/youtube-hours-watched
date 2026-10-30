import type { AnalyzeOptions, AnalyzeResult } from "./types";

/**
 * Reads a Takeout export (watch-history.html, watch-history.json or a Takeout .zip),
 * looks up video lengths and computes the dashboard.
 * Stub: the analysis core replaces this.
 */
export async function analyzeHistory(_file: Blob & { name?: string }, _opts: AnalyzeOptions): Promise<AnalyzeResult> {
  throw new Error("analyzeHistory is not implemented yet");
}
