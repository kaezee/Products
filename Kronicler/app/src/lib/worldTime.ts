// The world clock (design doc 3 §2–3). Everything the timeline positions,
// sorts, clusters, clamps, and frames runs on ONE signed integer: the day
// number. Day 0 = year 0, month 1, day 1. The writer authors a human date in
// their own calendar ({year,month,day} + precision); day_num is a derived
// cache recomputed from that whenever the calendar changes — never the reverse.

export type Precision = "year" | "month" | "day";

export interface WorldDate { year: number; month: number; day: number }

// A world's calendar. Cheap on purpose: months-per-year and (optionally uneven)
// month lengths, optional names. No leap rules, no concurrent reckonings — those
// break the flat cumulative-offset model and are additive later (§3.1).
export interface Calendar {
  monthsPerYear: number;      // default 12
  monthLengths: number[];     // length === monthsPerYear; default Array(12).fill(30)
  monthNames?: string[];      // optional; falls back to M1…Mn
}

// Calendar plus its cached derivations. toDayNum/fromDayNum use monthOffsets
// (cumulative start-day of each month) rather than a flat multiply, which is the
// only structural difference from a fixed calendar.
export interface DerivedCalendar extends Calendar {
  monthLengths: number[];
  daysPerYear: number;
  monthOffsets: number[];     // monthOffsets[i] = days before month i+1 within a year
}

export const DEFAULT_CALENDAR: Calendar = {
  monthsPerYear: 12,
  monthLengths: [30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
};

// Build (and validate) the derived calendar. Tolerates a stored calendar whose
// monthLengths don't match monthsPerYear by falling back to 30-day months.
export function deriveCalendar(cal: Calendar): DerivedCalendar {
  const mpy = Math.max(1, Math.floor(cal.monthsPerYear || 12));
  const lengths = (cal.monthLengths && cal.monthLengths.length === mpy)
    ? cal.monthLengths.map((n) => Math.max(1, Math.floor(n)))
    : Array(mpy).fill(30);
  const monthOffsets: number[] = [];
  let acc = 0;
  for (const len of lengths) { monthOffsets.push(acc); acc += len; }
  return { monthsPerYear: mpy, monthLengths: lengths, monthNames: cal.monthNames, daysPerYear: acc, monthOffsets };
}

function clampMonth(m: number, cal: DerivedCalendar): number {
  if (!Number.isFinite(m)) return 1;
  return Math.min(cal.monthsPerYear, Math.max(1, Math.floor(m)));
}
// Clamp a day to the last valid day of its month (§3.3 — invalid days clamp,
// they never overflow into the next month).
export function clampDay(day: number, month: number, cal: DerivedCalendar): number {
  const m = clampMonth(month, cal);
  const len = cal.monthLengths[m - 1];
  if (!Number.isFinite(day)) return 1;
  return Math.min(len, Math.max(1, Math.floor(day)));
}
// True when the authored day exceeds its month's length under this calendar.
export function isDayValid(d: WorldDate, cal: DerivedCalendar): boolean {
  const m = clampMonth(d.month, cal);
  return d.day >= 1 && d.day <= cal.monthLengths[m - 1] && Math.floor(d.day) === d.day;
}

export function toDayNum(d: WorldDate, cal: DerivedCalendar): number {
  const m = clampMonth(d.month, cal);
  const day = clampDay(d.day, m, cal);
  return d.year * cal.daysPerYear + cal.monthOffsets[m - 1] + (day - 1);
}

export function fromDayNum(n: number, cal: DerivedCalendar): WorldDate {
  const dpy = cal.daysPerYear;
  const year = Math.floor(n / dpy);
  let rem = n - year * dpy;               // always 0..dpy-1 (floor handles negatives)
  let month = cal.monthsPerYear;
  for (let i = 0; i < cal.monthsPerYear; i++) {
    const end = cal.monthOffsets[i] + cal.monthLengths[i];
    if (rem < end) { month = i + 1; rem -= cal.monthOffsets[i]; break; }
  }
  return { year, month, day: rem + 1 };
}

// The span of an authored date honours its precision (§2.3): a year-precision
// date owns its whole year, a month-precision date its whole month.
export function spanStart(d: WorldDate, precision: Precision, cal: DerivedCalendar): number {
  if (precision === "day") return toDayNum(d, cal);
  if (precision === "month") return toDayNum({ year: d.year, month: d.month, day: 1 }, cal);
  return toDayNum({ year: d.year, month: 1, day: 1 }, cal);
}
export function spanEnd(d: WorldDate, precision: Precision, cal: DerivedCalendar): number {
  if (precision === "day") return toDayNum(d, cal);
  const m = clampMonth(d.month, cal);
  if (precision === "month") return toDayNum({ year: d.year, month: m, day: cal.monthLengths[m - 1] }, cal);
  const last = cal.monthsPerYear;
  return toDayNum({ year: d.year, month: last, day: cal.monthLengths[last - 1] }, cal);
}

export function monthName(month: number, cal: DerivedCalendar): string {
  const m = clampMonth(month, cal);
  return cal.monthNames?.[m - 1] ?? `M${m}`;
}

// Human string for an authored date at its precision. Never borrows Gregorian
// month names — the world may not have them (§6.1).
export function formatWorldDate(d: WorldDate, precision: Precision, cal: DerivedCalendar): string {
  if (precision === "year") return String(d.year);
  if (precision === "month") return `${monthName(d.month, cal)} ${d.year}`;
  return `${monthName(d.month, cal)} ${d.day}, ${d.year}`;
}
