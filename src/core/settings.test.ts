import { describe, expect, it } from "vitest";
import { cleanApiKey } from "./settings";

describe("cleanApiKey", () => {
  it("removes spaces and invisible characters that copying can add", () => {
    expect(cleanApiKey("  AIzaSyA-b_c123 \n")).toBe("AIzaSyA-b_c123");
    expect(cleanApiKey("AIza​SyA⁠b﻿ ")).toBe("AIzaSyAb");
  });

  it("leaves other characters for the key check to report", () => {
    expect(cleanApiKey("AIza–Sy")).toBe("AIza–Sy");
  });
});
