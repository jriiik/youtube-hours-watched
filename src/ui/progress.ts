import type { Progress, Stage } from "../core/types";
import { int } from "./format";

export type StepState = "done" | "active" | "pending";

export interface StepModel {
  stage: Exclude<Stage, "done">;
  label: string;
  detail: string;
  state: StepState;
}

const STEPS: Exclude<Stage, "done">[] = ["reading", "parsing", "lookup", "computing"];

const LABELS: Record<Exclude<Stage, "done">, string> = {
  reading: "Reading file",
  parsing: "Reading history",
  lookup: "Looking up video lengths",
  computing: "Crunching numbers",
};

/**
 * Share of the bar each stage covers. Lookups dominate on a first run. HTML is parsed while
 * it is read, so "reading" covers both and "parsing" only reports the final count.
 */
const SPAN: Record<Exclude<Stage, "done">, [number, number]> = {
  reading: [0, 0.2],
  parsing: [0.2, 0.25],
  lookup: [0.25, 0.95],
  computing: [0.95, 1],
};

function stageFraction(p: Progress): number {
  if (!p.total || p.total <= 0 || p.done === undefined) return 0;
  return Math.min(1, Math.max(0, p.done / p.total));
}

/** Overall progress 0-1 across all stages. */
export function overallFraction(p: Progress | null): number {
  if (!p) return 0;
  if (p.stage === "done") return 1;
  const [from, to] = SPAN[p.stage];
  return from + (to - from) * stageFraction(p);
}

/**
 * Count shown next to the current step. Entries are counted one by one; reading and lookups
 * are shown as a percentage because their units (bytes, batches of IDs) mean little to people.
 */
function liveDetail(p: Progress): string {
  if (p.stage === "parsing" && p.done !== undefined) return `${int(p.done)} entries`;
  if ((p.stage === "reading" || p.stage === "lookup") && p.total) return `${Math.floor(stageFraction(p) * 100)}%`;
  return "";
}

/** The four steps with their state; `seen` keeps details of finished steps (e.g. the entry count). */
export function stepModels(p: Progress | null, seen: Partial<Record<Stage, string>> = {}): StepModel[] {
  const current = p ? (p.stage === "done" ? STEPS.length : STEPS.indexOf(p.stage)) : 0;
  return STEPS.map((stage, i) => {
    const state: StepState = i < current ? "done" : i === current ? "active" : "pending";
    const detail = state === "active" && p && p.stage === stage ? liveDetail(p) : state === "done" ? (seen[stage] ?? "") : "";
    return { stage, label: LABELS[stage], detail, state };
  });
}

/** Title for the current moment, e.g. "Reading history (57,260 entries)". */
export function headline(p: Progress | null): string {
  if (!p || p.stage === "reading") return LABELS.reading;
  if (p.stage === "done") return "Done";
  if (p.stage === "parsing" && p.done !== undefined) return `${LABELS.parsing} (${int(p.done)} entries)`;
  return LABELS[p.stage];
}

/** The core's own note for lookups, e.g. "12,345 videos to look up, 42,282 saved from earlier runs". */
export function subline(p: Progress | null): string {
  return p?.stage === "lookup" && p.detail ? p.detail : "";
}
