import type { Weekday } from "../core/types";

// Formatting rules from the Night design. The interface is English-only, so numbers
// always use en-US grouping ("57,260").

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const WEEKDAYS: Weekday[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const WEEKDAY_PLURAL: Record<Weekday, string> = {
  Mon: "Mondays",
  Tue: "Tuesdays",
  Wed: "Wednesdays",
  Thu: "Thursdays",
  Fri: "Fridays",
  Sat: "Saturdays",
  Sun: "Sundays",
};

const finite = (n: number) => (Number.isFinite(n) ? n : 0);

/** Whole number with thousands separators. */
export function int(n: number): string {
  return Math.round(finite(n)).toLocaleString("en-US");
}

/** Hours: one decimal below 1,000, whole hours above ("217.2 h", "4,254 h"). */
export function hrs(h: number): string {
  const tenth = Math.round(finite(h) * 10) / 10;
  // A few seconds of watching should not read as nothing at all.
  if (tenth === 0) return h > 0 ? "< 0.1 h" : "0 h";
  return (Math.abs(tenth) >= 1000 ? int(tenth) : String(tenth)) + " h";
}

/** A number of hours without the unit: whole above 10, one decimal below ("0.2", "4,254"). */
export function hoursFigure(h: number): string {
  const x = finite(h);
  return x >= 10 ? int(x) : String(Math.round(x * 10) / 10);
}

/** Minutes as "5 h 18 min", "45 min" or "2 h". */
export function dur(min: number): string {
  const t = Math.max(0, Math.round(finite(min)));
  const h = Math.floor(t / 60);
  const r = t % 60;
  if (h === 0) return `${r} min`;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}

/** "2020-07-19" as "Jul 19, 2020". Anything else is returned unchanged. */
export function fdate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${Number(m[3])}, ${m[1]}` : iso;
}

/** Hour of day 0-23 as "12 am", "3 pm". */
export function hourLabel(h: number): string {
  const x = ((Math.round(finite(h)) % 24) + 24) % 24;
  if (x === 0) return "12 am";
  if (x === 12) return "12 pm";
  return x > 12 ? `${x - 12} pm` : `${x} am`;
}

/** Video length in seconds as "1:12:00" or "20:13". */
export function clock(sec: number): string {
  const t = Math.max(0, Math.round(finite(sec)));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const p = (x: number) => String(x).padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}

/** Up to two initials for an avatar, skipping a leading "The". */
export function initials(name: string): string {
  const words = name.split(/\s+/).filter((w) => w && w.toLowerCase() !== "the");
  // Array.from keeps emoji and other astral characters whole.
  const letters = words.slice(0, 2).map((w) => Array.from(w)[0] ?? "");
  const out = letters.join("").toUpperCase();
  return out || Array.from(name.trim())[0]?.toUpperCase() || "?";
}

export function weekdayPlural(d: Weekday): string {
  return WEEKDAY_PLURAL[d] ?? d;
}

/** "2019-03" as "Mar 2019". */
export function monthName(ym: string): string {
  const [y, m] = ym.split("-");
  const month = MONTHS[Number(m) - 1];
  return month ? `${month} ${y}` : ym;
}

/** "1 video", "2 videos". */
export function count(n: number, one: string, many: string): string {
  return `${int(n)} ${Math.round(n) === 1 ? one : many}`;
}

/** File size as "41.5 MB". */
export function fileSize(bytes: number): string {
  const b = Math.max(0, finite(bytes));
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, finite(n)));
}
