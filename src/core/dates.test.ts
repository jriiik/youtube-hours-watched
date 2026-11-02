import { describe, expect, it } from "vitest";
import { monthFromWord, parseTakeoutDate, zoneOffsetMinutes } from "./dates";

const local = (iso: string) => Date.parse(`${iso}Z`);

describe("parseTakeoutDate", () => {
  it("reads en-GB dates", () => {
    expect(parseTakeoutDate("30 Oct 2026, 11:41:27 CET")).toEqual({
      localMs: local("2026-10-30T11:41:27"),
      offsetMin: 60,
      zone: "CET",
      zoneUnknown: false,
    });
    expect(parseTakeoutDate("1 Oct 2026, 00:00:01 CET")?.localMs).toBe(local("2026-10-01T00:00:01"));
  });

  it('reads "Sept" and other month spellings', () => {
    expect(parseTakeoutDate("5 Sept 2025, 23:59:59 CEST")).toMatchObject({ localMs: local("2025-09-05T23:59:59"), offsetMin: 120 });
    expect(parseTakeoutDate("5 Sep 2025, 23:59:59 CEST")?.localMs).toBe(local("2025-09-05T23:59:59"));
    expect(parseTakeoutDate("5 September 2025, 08:00:00 GMT")?.localMs).toBe(local("2025-09-05T08:00:00"));
    expect(parseTakeoutDate("12 June 2024, 08:00:00 BST")).toMatchObject({ localMs: local("2024-06-12T08:00:00"), offsetMin: 60 });
  });

  it("reads en-US dates with a 12-hour clock and any space before AM/PM", () => {
    for (const space of [" ", "\u202f", "\u00a0"]) {
      expect(parseTakeoutDate(`Oct 30, 2026, 11:41:27${space}AM EST`)).toEqual({
        localMs: local("2026-10-30T11:41:27"),
        offsetMin: -300,
        zone: "EST",
        zoneUnknown: false,
      });
      expect(parseTakeoutDate(`Oct 30, 2026, 1:02:03${space}PM PDT`)).toMatchObject({ localMs: local("2026-10-30T13:02:03"), offsetMin: -420 });
    }
    expect(parseTakeoutDate("Jan 1, 2026, 12:05:00\u202fAM PST")?.localMs).toBe(local("2026-01-01T00:05:00"));
    expect(parseTakeoutDate("Jan 1, 2026, 12:05:00\u202fPM PST")?.localMs).toBe(local("2026-01-01T12:05:00"));
    expect(parseTakeoutDate("Sep 9, 2026, 9:09:09 p.m. MST")?.localMs).toBe(local("2026-09-09T21:09:09"));
  });

  it("reads numeric offsets", () => {
    expect(parseTakeoutDate("30 Oct 2026, 11:41:27 GMT+02:00")).toMatchObject({ offsetMin: 120, zone: "GMT+02:00", zoneUnknown: false });
    expect(parseTakeoutDate("30 Oct 2026, 11:41:27 UTC+2")?.offsetMin).toBe(120);
    expect(parseTakeoutDate("30 Oct 2026, 11:41:27 UTC\u22123")?.offsetMin).toBe(-180);
    expect(parseTakeoutDate("30 Oct 2026, 11:41:27 GMT+5:30")?.offsetMin).toBe(330);
    expect(parseTakeoutDate("30 Oct 2026, 11:41:27 GMT-0800")?.offsetMin).toBe(-480);
  });

  it("reads numeric and translated layouts", () => {
    expect(parseTakeoutDate("30.10.2026, 11:41:27 MEZ")).toMatchObject({ localMs: local("2026-10-30T11:41:27"), offsetMin: 60 });
    expect(parseTakeoutDate("2026/10/30 11:41:27 JST")).toMatchObject({ localMs: local("2026-10-30T11:41:27"), offsetMin: 540 });
    expect(parseTakeoutDate("2026. 10. 30. 오후 1:41:27 KST")?.localMs).toBe(local("2026-10-30T13:41:27"));
    expect(parseTakeoutDate("30 oct. 2026, 11:41:27 UTC+1")).toMatchObject({ localMs: local("2026-10-30T11:41:27"), offsetMin: 60 });
    expect(parseTakeoutDate("30 de out. de 2026, 11:41:27 BRT")?.offsetMin).toBe(-180);
    expect(parseTakeoutDate("30 Okt. 2026, 11:41:27 Uhr MEZ")?.offsetMin).toBe(60);
  });

  it("reads layouts of more languages", () => {
    // As CLDR writes them; not yet checked against real exports in these languages.
    expect(parseTakeoutDate("15 Okt 2026, 8:05:09 PTG MYT")).toMatchObject({ localMs: local("2026-10-15T20:05:09"), offsetMin: 480, zoneUnknown: false });
    expect(parseTakeoutDate("16 Okt 2026, 2:05:09 PG MYT")?.localMs).toBe(local("2026-10-16T02:05:09"));
    expect(parseTakeoutDate("2026年10月15日 晚上8:05:09 [GMT+8]")).toMatchObject({ localMs: local("2026-10-15T20:05:09"), offsetMin: 480, zoneUnknown: false });
    expect(parseTakeoutDate("2026年10月16日 凌晨12:05:09 [GMT+8]")?.localMs).toBe(local("2026-10-16T00:05:09"));
    expect(parseTakeoutDate("2026年10月16日 中午12:05:09 [GMT+8]")?.localMs).toBe(local("2026-10-16T12:05:09"));
    expect(parseTakeoutDate("15. lis 2026. 20:05:09 CEST")?.localMs).toBe(local("2026-10-15T20:05:09")); // Croatian: October
    expect(parseTakeoutDate("15 lis 2026, 20:05:09 CET")?.localMs).toBe(local("2026-11-15T20:05:09")); // Polish: November
    expect(parseTakeoutDate("15. 10. 2026 20:05:09 SELČ")).toMatchObject({ offsetMin: 120, zoneUnknown: false });
    expect(parseTakeoutDate("15.10.2026 г., 21:05:09 ч. Гринуич+3")).toMatchObject({ localMs: local("2026-10-15T21:05:09"), offsetMin: 180, zoneUnknown: false });
    expect(parseTakeoutDate("15. des. 2026, 07:05:09 CET")?.localMs).toBe(local("2026-12-15T07:05:09"));
    expect(parseTakeoutDate("15 d’ag. 2026, 20:05:09 CEST")?.localMs).toBe(local("2026-08-15T20:05:09"));
    expect(parseTakeoutDate("15. dets 2026, 08:05:09 GMT +2")).toMatchObject({ localMs: local("2026-12-15T08:05:09"), offsetMin: 120 });
    expect(parseTakeoutDate("Dis 15, 2026, 2:05:09 PM GMT+8")?.localMs).toBe(local("2026-12-15T14:05:09"));
  });

  it("treats an unknown zone label as UTC and flags it", () => {
    expect(parseTakeoutDate("30 Oct 2026, 11:41:27 XYZ")).toEqual({
      localMs: local("2026-10-30T11:41:27"),
      offsetMin: 0,
      zone: "XYZ",
      zoneUnknown: true,
    });
    expect(parseTakeoutDate("30 Oct 2026, 11:41:27")).toMatchObject({ offsetMin: 0, zone: "", zoneUnknown: false });
  });

  it("rejects what it can't read", () => {
    expect(parseTakeoutDate("")).toBeNull();
    expect(parseTakeoutDate("YouTube watch history")).toBeNull();
    expect(parseTakeoutDate("31 Feb 2026, 11:41:27 CET")).toBeNull();
    expect(parseTakeoutDate("29 Feb 2024, 11:41:27 CET")?.localMs).toBe(local("2024-02-29T11:41:27"));
    expect(parseTakeoutDate("30 Oct 2026, 25:41:27 CET")).toBeNull();
    expect(parseTakeoutDate("Oct 30, 2026, 13:41:27 PM EST")).toBeNull();
    // Month and day order can't be told apart.
    expect(parseTakeoutDate("10/11/2026, 11:41:27 CET")).toBeNull();
  });
});

describe("zoneOffsetMinutes", () => {
  it("maps the common abbreviations", () => {
    const expected: Record<string, number> = {
      UTC: 0, GMT: 0, WET: 0, WEST: 60, CET: 60, CEST: 120, EET: 120, EEST: 180, BST: 60, MSK: 180,
      EST: -300, EDT: -240, CST: -360, CDT: -300, MST: -420, MDT: -360, PST: -480, PDT: -420,
      AKST: -540, AKDT: -480, HST: -600, IST: 330, JST: 540, KST: 540, AEST: 600, AEDT: 660,
      ACST: 570, ACDT: 630, AWST: 480, NZST: 720, NZDT: 780,
    };
    for (const [label, minutes] of Object.entries(expected)) expect({ label, minutes: zoneOffsetMinutes(label) }).toEqual({ label, minutes });
  });

  it("reads offsets and rejects nonsense", () => {
    expect(zoneOffsetMinutes("GMT+01:00")).toBe(60);
    expect(zoneOffsetMinutes("(UTC-03:30)")).toBe(-210);
    expect(zoneOffsetMinutes("+0545")).toBe(345);
    expect(zoneOffsetMinutes("GMT+25")).toBeNull();
    expect(zoneOffsetMinutes("Mars Time")).toBeNull();
  });
});

describe("monthFromWord", () => {
  it("knows English and a few other languages", () => {
    expect(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"].map(monthFromWord)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."].map(monthFromWord)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(monthFromWord("de")).toBe(0);
    expect(monthFromWord("Uhr")).toBe(0);
  });

  it("knows the short month words of Romanian, Estonian, Filipino, Malay, Hungarian and Slovenian", () => {
    expect(["ian.", "iun.", "iul.", "jaan", "veebr", "juuni", "juuli", "dets", "Peb", "Hun", "Hul", "Nob", "Dis", "Mac", "Ogo", "szept.", "avg."].map(monthFromWord)).toEqual([
      1, 6, 7, 1, 2, 6, 7, 12, 2, 6, 7, 11, 12, 3, 8, 9, 8,
    ]);
  });
});
