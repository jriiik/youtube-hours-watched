import { describe, expect, it } from "vitest";
import { classifyError, isAbortError, keyProblemText } from "./errors";

/** Shaped like the core's AnalysisError, without importing it. */
const tagged = (reason: string, message = "A message for people.") =>
  Object.assign(new Error(message), { name: "AnalysisError", reason });

describe("classifyError", () => {
  it("maps the reasons the core attaches", () => {
    expect(classifyError(tagged("not-history"))).toMatchObject({ kind: "not-history", friendly: true });
    expect(classifyError(tagged("empty")).kind).toBe("empty");
    expect(classifyError(tagged("dates")).kind).toBe("dates");
    expect(classifyError(tagged("bad-zip")).kind).toBe("bad-zip");
    expect(classifyError(tagged("quota")).kind).toBe("quota");
    expect(classifyError(tagged("network")).kind).toBe("network");
    expect(classifyError(tagged("unknown"))).toMatchObject({ kind: "unexpected", friendly: true });
    expect(classifyError(tagged("api-not-enabled"))).toMatchObject({ kind: "key", reason: "api-not-enabled" });
    expect(classifyError(tagged("invalid", "Shown as is.")).message).toBe("Shown as is.");
  });

  it("falls back to the message for untagged errors", () => {
    expect(classifyError(new Error("This doesn't look like a watch history file"))).toMatchObject({
      kind: "not-history",
      friendly: false,
    });
    expect(classifyError(new Error("API key not valid. Please pass a valid API key.")).reason).toBe("invalid");
    expect(classifyError(new Error("You have exceeded your quota.")).kind).toBe("quota");
    expect(classifyError(new TypeError("Failed to fetch")).kind).toBe("network");
    expect(classifyError(new Error("No API key")).kind).toBe("missing-key");
    expect(classifyError(new TypeError("x is undefined"))).toMatchObject({ kind: "unexpected", friendly: false });
    expect(classifyError("boom").message).toBe("boom");
  });

  it("recognises cancellation", () => {
    expect(isAbortError(new DOMException("Aborted", "AbortError"))).toBe(true);
    expect(isAbortError(Object.assign(new Error("stop"), { name: "AbortError" }))).toBe(true);
    expect(isAbortError(new Error("nope"))).toBe(false);
  });

  it("explains every key problem in plain words", () => {
    for (const r of ["invalid", "api-not-enabled", "wrong-api", "referrer-blocked", "quota", "network", "unknown"] as const) {
      expect(keyProblemText(r).length).toBeGreaterThan(20);
    }
    expect(keyProblemText("unknown", "HTTP 500")).toContain("HTTP 500");
  });
});
