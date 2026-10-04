// Lenient date parsing for forms and CSV imports. Pure functions (easy to test).

export type DateParse = { ok: true; value: string | null } | { ok: false; error: string };

/** How to read ambiguous dates like 03/09/2026: month first (US, Meta exports) or day first. */
export type DateOrder = "mdy" | "dmy";

const DAY_MS = 24 * 60 * 60 * 1000;
const SLASH_DATE = /^(\d{1,2})([/.-])(\d{1,2})\2(\d{2}|\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]m)?)?$/i;

/** Builds a UTC date at noon, so the calendar day stays the same in almost every time zone. */
function noonUtc(year: number, month: number, day: number): Date | null {
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

/**
 * Looks at a whole column of dates and decides the order once, so one file is never read
 * half month/day and half day/month. A value like 28/08/2026 proves day-first; 08/28/2026
 * proves month-first. With no proof either way, month-first (Meta's export format) is used.
 */
export function detectDateOrder(values: unknown[]): DateOrder {
  let dayFirst = 0;
  let monthFirst = 0;
  for (const value of values) {
    const m = String(value ?? "").trim().match(SLASH_DATE);
    if (!m || m[2] === ".") continue; // dotted dates are always day-first
    const [a, b] = [Number(m[1]), Number(m[3])];
    if (a > 12 && b <= 12) dayFirst++;
    else if (b > 12 && a <= 12) monthFirst++;
  }
  return dayFirst > monthFirst ? "dmy" : "mdy";
}

/**
 * Understands "2026-09-14", "2026/09/14", "2026-09-14 18:30", "9/14/2026", "14.09.2026",
 * "Sep 14, 2026" and full ISO timestamps (times without a zone are UTC). Ambiguous slash dates
 * follow `order` (default month/day); a date that only works the other way round is read that way.
 * Blank → null. Dates more than a day in the future are rejected.
 */
export function parseDateInput(
  input: unknown,
  label = "Date",
  now: Date = new Date(),
  options: { order?: DateOrder } = {},
): DateParse {
  if (input == null) return { ok: true, value: null };
  const text = String(input).trim();
  if (text === "") return { ok: true, value: null };

  let date: Date | null = null;
  let m: RegExpMatchArray | null;
  if ((m = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) {
    date = noonUtc(Number(m[1]), Number(m[2]), Number(m[3]));
  } else if ((m = text.match(SLASH_DATE))) {
    const dayFirst = m[2] === "." || options.order === "dmy";
    let [month, day] = dayFirst ? [Number(m[3]), Number(m[1])] : [Number(m[1]), Number(m[3])];
    if (month > 12 && day <= 12) [month, day] = [day, month]; // only valid the other way round
    const year = m[4].length === 2 ? 2000 + Number(m[4]) : Number(m[4]);
    date = noonUtc(year, month, day);
    if (date && m[5]) {
      let hours = Number(m[5]);
      const meridiem = m[7]?.toLowerCase();
      if (meridiem === "pm" && hours < 12) hours += 12;
      if (meridiem === "am" && hours === 12) hours = 0;
      if (hours > 23 || Number(m[6]) > 59) date = null;
      else date.setUTCHours(hours, Number(m[6]));
    }
  } else if (/^\d{4}-\d{1,2}-\d{1,2}[T ]\d{1,2}:\d{2}/.test(text)) {
    const iso = text.replace(" ", "T");
    const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(iso);
    const parsed = new Date(hasZone ? iso : `${iso}Z`);
    date = Number.isNaN(parsed.getTime()) ? null : parsed;
  } else if (/[a-z]/i.test(text)) {
    const hasMonthName = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(text);
    if (hasMonthName && !/\b\d{4}\b/.test(text)) {
      return { ok: false, error: `${label} "${text}" needs a year, e.g. Sep 14, 2026.` };
    }
    // Month names: read in UTC (noon when there's no time) so browser and server agree.
    const hasTime = /\d:\d{2}/.test(text);
    const parsed = new Date(hasTime ? `${text} UTC` : `${text} 12:00 UTC`);
    date = Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (!date) return { ok: false, error: `${label} "${text}" isn't a date. Use YYYY-MM-DD, e.g. 2026-09-14.` };
  if (date.getTime() > now.getTime() + DAY_MS) return { ok: false, error: `${label} can't be in the future.` };
  if (date.getUTCFullYear() < 2005) return { ok: false, error: `${label} "${text}" looks too old.` };
  return { ok: true, value: date.toISOString() };
}

/** "2026-09-14" for an <input type="date">, from an ISO timestamp (UTC day). */
export function toDateInputValue(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "";
}
