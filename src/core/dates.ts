// Dates as Takeout's watch-history.html writes them, e.g. "30 Oct 2026, 11:13:52 CET" (en-GB),
// "Oct 30, 2026, 11:13:52 AM EST" (en-US) or "30.10.2026, 11:13:52 GMT+01:00".

export interface TakeoutDate {
  /** The wall-clock time as written, in ms, encoded as if it were UTC. */
  localMs: number;
  /** Minutes east of UTC; 0 when the zone label is missing or unknown. */
  offsetMin: number;
  /** The zone label as written ("CET", "GMT+02:00"); "" when there is none. */
  zone: string;
  /** A zone label was written but isn't one we know. */
  zoneUnknown: boolean;
}

/** Minutes east of UTC. Ambiguous labels take their most common meaning (IST = India, CST = US Central). */
const ZONES: Record<string, number> = {
  UTC: 0, GMT: 0, UT: 0, Z: 0,
  WET: 0, WEST: 60, WEZ: 0, WESZ: 60, BST: 60, IST: 330,
  CET: 60, CEST: 120, MEZ: 60, MESZ: 120,
  EET: 120, EEST: 180, OEZ: 120, OESZ: 180, MSK: 180,
  EST: -300, EDT: -240, CST: -360, CDT: -300, MST: -420, MDT: -360, PST: -480, PDT: -420,
  AKST: -540, AKDT: -480, HST: -600, AST: -240, ADT: -180, NST: -210, NDT: -150,
  JST: 540, KST: 540, HKT: 480, SGT: 480, PHT: 480, WIB: 420, PKT: 300,
  AEST: 600, AEDT: 660, ACST: 570, ACDT: 630, AWST: 480, NZST: 720, NZDT: 780,
  BRT: -180, ART: -180, SAST: 120, EAT: 180, WAT: 60,
};

const OFFSET = /^(?:GMT|UTC|UT)?\s?([+\-\u2212\u2013])\s?(\d{1,2})(?::?(\d{2}))?$/i;

/** UTC offset in minutes for a zone label such as "CET", "GMT+02:00" or "UTC-3"; null if unknown. */
export function zoneOffsetMinutes(label: string): number | null {
  const key = label.trim().replace(/^\((.*)\)$/, "$1").trim();
  const named = ZONES[key.toUpperCase()];
  if (named !== undefined) return named;
  const m = OFFSET.exec(key);
  if (!m) return null;
  const hours = Number(m[2]);
  const minutes = m[3] ? Number(m[3]) : 0;
  if (hours > 14 || minutes > 59) return null;
  return (m[1] === "+" ? 1 : -1) * (hours * 60 + minutes);
}

// Month words by prefix (accents removed). English first; the others are a best effort for
// translated exports and have not been checked against real files.
const MONTH_PREFIXES: [string, number][] = [
  ["jan", 1], ["feb", 2], ["mar", 3], ["apr", 4], ["may", 5], ["jun", 6], ["jul", 7], ["aug", 8],
  ["sep", 9], ["oct", 10], ["nov", 11], ["dec", 12],
  // de, fr, es, it, nl, pt, pl, sv, tr, ru
  ["ene", 1], ["gen", 1], ["sty", 1], ["oca", 1], ["янв", 1],
  ["fev", 2], ["lut", 2], ["sub", 2], ["фев", 2],
  ["maa", 3], ["mrt", 3], ["мар", 3],
  ["abr", 4], ["avr", 4], ["kwi", 4], ["nis", 4], ["апр", 4],
  ["mai", 5], ["maj", 5], ["mag", 5], ["mei", 5], ["мая", 5], ["май", 5], ["маи", 5],
  ["juin", 6], ["giu", 6], ["cze", 6], ["haz", 6], ["июн", 6],
  ["juil", 7], ["lug", 7], ["lip", 7], ["tem", 7], ["июл", 7],
  ["ago", 8], ["aou", 8], ["sie", 8], ["agu", 8], ["авг", 8],
  ["set", 9], ["wrz", 9], ["eyl", 9], ["сен", 9],
  ["okt", 10], ["out", 10], ["ott", 10], ["paz", 10], ["eki", 10], ["окт", 10],
  ["lis", 11], ["kas", 11], ["ноя", 11],
  ["dez", 12], ["dic", 12], ["gru", 12], ["ara", 12], ["дек", 12],
];

const monthCache = new Map<string, number>();

/** Month number for a month word ("Oct", "Sept", "October", "okt."), or 0. */
export function monthFromWord(word: string): number {
  const cached = monthCache.get(word);
  if (cached !== undefined) return cached;
  const w = word.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/\.$/, "");
  let month = 0;
  if (w.length >= 3 && w.length <= 12) {
    for (const [prefix, m] of MONTH_PREFIXES) {
      if (w.startsWith(prefix)) {
        month = m;
        break;
      }
    }
  }
  if (monthCache.size < 1000) monthCache.set(word, month);
  return month;
}

const SPACES = /[\u00a0\u202f\u2007\u2009\u200a\u2002\u2003]/g;
const MARKS = /[\u200e\u200f\u061c]/g;
const EN_GB = /^(\d{1,2}) ([A-Za-z]{3,9}) (\d{4}), (\d{1,2}):(\d{2}):(\d{2}) ([A-Za-z]{1,5})$/;
const TIME = /(\d{1,2}):(\d{2})(?::(\d{2}))?(?:[.,]\d{1,3})?(?:\s?([AaPp])\.?\s?[Mm]\.?(?!\p{L}))?/u;
const DATE_TOKENS = /\d+|\p{L}+/gu;
const PM_WORDS = /오후|午後|下午/;
const AM_WORDS = /오전|午前|上午/;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const zoneCache = new Map<string, number | null>();

function cachedZoneOffset(label: string): number | null {
  let offset = zoneCache.get(label);
  if (offset === undefined) {
    offset = zoneOffsetMinutes(label);
    if (offset === null) {
      // "Uhr MEZ" and similar: the zone is usually the last word.
      const last = label.slice(label.lastIndexOf(" ") + 1);
      if (last !== label) offset = zoneOffsetMinutes(last);
    }
    if (zoneCache.size < 1000) zoneCache.set(label, offset);
  }
  return offset;
}

function build(y: number, mo: number, d: number, h: number, mi: number, s: number, zone: string): TakeoutDate | null {
  if (y < 1970 || y > 2200 || mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59 || s > 59) return null;
  const leap = mo === 2 && (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0));
  if (d > DAYS_IN_MONTH[mo - 1] + (leap ? 1 : 0)) return null;
  const offset = zone ? cachedZoneOffset(zone) : 0;
  return {
    localMs: Date.UTC(y, mo - 1, d, h, mi, s),
    offsetMin: offset ?? 0,
    zone,
    zoneUnknown: offset === null,
  };
}

/** Year, month, day from the part before the time, or null when unreadable or ambiguous. */
function parseDatePart(part: string): [number, number, number] | null {
  const tokens = part.match(DATE_TOKENS) ?? [];
  const nums: string[] = [];
  let month = 0;
  for (const t of tokens) {
    if (t.charCodeAt(0) <= 57 && t.charCodeAt(0) >= 48) nums.push(t);
    else {
      // The last month-like word wins: weekday names ("mardi") come before the month.
      const m = monthFromWord(t);
      if (m) month = m;
    }
  }
  if (month) {
    if (nums.length !== 2) return null;
    const yearAt = nums[0].length === 4 ? 0 : nums[1].length === 4 ? 1 : -1;
    if (yearAt < 0) return null;
    return [Number(nums[yearAt]), month, Number(nums[1 - yearAt])];
  }
  if (nums.length !== 3) return null;
  if (nums[0].length === 4) return [Number(nums[0]), Number(nums[1]), Number(nums[2])];
  // 30.10.2026 is day-first; 10/30/2026 could be either way round, so it isn't guessed.
  if (nums[2].length === 4 && !part.includes("/")) return [Number(nums[2]), Number(nums[1]), Number(nums[0])];
  return null;
}

/** Reads one Takeout date; null when it can't be read. */
export function parseTakeoutDate(raw: string): TakeoutDate | null {
  const text = raw.replace(SPACES, " ").replace(MARKS, "").replace(/\s{2,}/g, " ").trim();
  const fast = EN_GB.exec(text);
  if (fast) {
    const month = monthFromWord(fast[2]);
    if (month) return build(+fast[3], month, +fast[1], +fast[4], +fast[5], +fast[6], fast[7]);
  }
  const t = TIME.exec(text);
  if (!t) return null;
  const ymd = parseDatePart(text.slice(0, t.index));
  if (!ymd) return null;
  let hour = Number(t[1]);
  const meridiem = t[4] ? t[4].toLowerCase() : PM_WORDS.test(text) ? "p" : AM_WORDS.test(text) ? "a" : "";
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (meridiem === "p" ? 12 : 0);
  }
  const zone = text.slice(t.index + t[0].length).trim();
  return build(ymd[0], ymd[1], ymd[2], hour, Number(t[2]), t[3] ? Number(t[3]) : 0, zone);
}
