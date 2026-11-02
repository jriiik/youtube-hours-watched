import type { DashboardData } from "../core/types";

/** The invented sample shown by "Try with sample data"; loaded on demand to keep startup light. */
export async function loadSampleData(): Promise<DashboardData> {
  const mod = await import("../sample/sample-data.json");
  return mod.default as unknown as DashboardData;
}

/** Enough of a shape check that the dashboard can render without crashing. */
export function isDashboardData(x: unknown): x is DashboardData {
  if (!x || typeof x !== "object") return false;
  const d = x as Partial<DashboardData>;
  const all = d.views?.all;
  return Array.isArray(d.years) && !!all && typeof all.summary === "object" && Array.isArray(all.monthly);
}
