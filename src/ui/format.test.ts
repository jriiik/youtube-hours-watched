import { describe, expect, it } from "vitest";
import { clock, count, dur, fdate, fileSize, hourLabel, hoursFigure, hrs, initials, int, monthName } from "./format";

describe("format", () => {
  it("formats whole numbers with en-US grouping", () => {
    expect(int(57260)).toBe("57,260");
    expect(int(4254.4)).toBe("4,254");
    expect(int(Number.NaN)).toBe("0");
  });

  it("formats hours like the design", () => {
    expect(hrs(217.2)).toBe("217.2 h");
    expect(hrs(74.0)).toBe("74 h");
    expect(hrs(4254)).toBe("4,254 h");
    expect(hrs(7322.6)).toBe("7,323 h");
    expect(hrs(999.96)).toBe("1,000 h");
    expect(hrs(0.04)).toBe("< 0.1 h");
    expect(hrs(0)).toBe("0 h");
    expect(hoursFigure(4254.4)).toBe("4,254");
    expect(hoursFigure(0.24)).toBe("0.2");
  });

  it("formats minutes as hours and minutes", () => {
    expect(dur(318)).toBe("5 h 18 min");
    expect(dur(45)).toBe("45 min");
    expect(dur(120)).toBe("2 h");
    expect(dur(91.5)).toBe("1 h 32 min");
  });

  it("formats dates, hours and clocks", () => {
    expect(fdate("2020-07-19")).toBe("Jul 19, 2020");
    expect(fdate("")).toBe("");
    expect(hourLabel(0)).toBe("12 am");
    expect(hourLabel(12)).toBe("12 pm");
    expect(hourLabel(23)).toBe("11 pm");
    expect(hourLabel(9)).toBe("9 am");
    expect(clock(4320)).toBe("1:12:00");
    expect(clock(571)).toBe("9:31");
    expect(monthName("2019-03")).toBe("Mar 2019");
  });

  it("builds initials without 'The' and keeps emoji whole", () => {
    expect(initials("The Long Table")).toBe("LT");
    expect(initials("Rainy Window Jazz")).toBe("RW");
    expect(initials("Orbit")).toBe("O");
    expect(initials("🎵 Beats")).toBe("🎵B");
    expect(initials("The")).toBe("T");
  });

  it("pluralises counts and sizes files", () => {
    expect(count(1, "day", "days")).toBe("1 day");
    expect(count(45, "day", "days")).toBe("45 days");
    expect(fileSize(41_485_979)).toBe("39.6 MB");
    expect(fileSize(2048)).toBe("2 KB");
  });
});
