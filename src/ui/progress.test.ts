import { describe, expect, it } from "vitest";
import { headline, overallFraction, stepModels, subline } from "./progress";

describe("progress", () => {
  it("names the current step", () => {
    expect(headline(null)).toBe("Reading file");
    expect(headline({ stage: "parsing" })).toBe("Reading history");
    expect(headline({ stage: "parsing", done: 57260, total: 57260 })).toBe("Reading history (57,260 entries)");
    expect(headline({ stage: "lookup", done: 12, total: 1093 })).toBe("Looking up video lengths");
    expect(headline({ stage: "computing" })).toBe("Crunching numbers");
  });

  it("passes the core's lookup note through", () => {
    const detail = "12,345 videos to look up, 42,282 saved from earlier runs";
    expect(subline({ stage: "lookup", done: 0, total: 247, detail })).toBe(detail);
    expect(subline({ stage: "reading", done: 1, total: 2, detail: "watch-history.json" })).toBe("");
  });

  it("moves the bar forward through the stages", () => {
    expect(overallFraction(null)).toBe(0);
    expect(overallFraction({ stage: "reading", done: 50, total: 100 })).toBeCloseTo(0.1);
    expect(overallFraction({ stage: "parsing" })).toBeCloseTo(0.2);
    expect(overallFraction({ stage: "lookup", done: 50, total: 100 })).toBeCloseTo(0.6);
    expect(overallFraction({ stage: "computing" })).toBeCloseTo(0.95);
    expect(overallFraction({ stage: "done" })).toBe(1);
  });

  it("marks steps done, active and pending", () => {
    const steps = stepModels({ stage: "lookup", done: 452, total: 1093 }, { parsing: "57,260 entries" });
    expect(steps.map((s) => s.state)).toEqual(["done", "done", "active", "pending"]);
    expect(steps[1].detail).toBe("57,260 entries");
    expect(steps[2].detail).toBe("41%");
    expect(stepModels({ stage: "done" }).every((s) => s.state === "done")).toBe(true);
  });
});
