// Lenient date parsing for forms and CSV imports. Pure functions (easy to test).

export type DateParse = { ok: true; value: string | null } | { ok: false; error: string };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Builds a UTC date at noon, so the calendar day stays the same in almost every time zone. */
function noonUtc(year: number, month: number, day: number): Date | null {
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

/**
 * Understands "2026-09-14", "2026-09-14 18:30", "9/14/2026", "14/9/2026" (when the day is over 12),
 * "Sep 14, 2026" and full ISO timestamps. Ambiguous slashes like 09/01/2026 are read as month/day
 * (the format Meta's exports use). Blank → null. Dates more than a day in the future are rejected.
 */
export function parseDateInput(input: unknown, label = "Date", now: Date = new Date()): DateParse {
  if (input == null) return { ok: true, value: null };
  const text = String(input).trim();
  if (text === "") return { ok: true, value: null };

  let date: Date | null = null;
  let m: RegExpMatchArray | null;
  if ((m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) {
    date = noonUtc(Number(m[1]), Number(m[2]), Number(m[3]));
  } else if ((m = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]m)?)?$/i))) {
    let [a, b] = [Number(m[1]), Number(m[2])];
    if (a > 12 && b <= 12) [a, b] = [b, a]; // day/month
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    date = noonUtc(year, a, b);
    if (date && m[4]) {
      let hours = Number(m[4]);
      const meridiem = m[6]?.toLowerCase();
      if (meridiem === "pm" && hours < 12) hours += 12;
      if (meridiem === "am" && hours === 12) hours = 0;
      if (hours > 23 || Number(m[5]) > 59) date = null;
      else date.setUTCHours(hours, Number(m[5]));
    }
  } else if (/^\d{4}-\d{1,2}-\d{1,2}[T ]\d{1,2}:\d{2}/.test(text)) {
    const iso = text.replace(" ", "T");
    const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(iso);
    const parsed = new Date(hasZone ? iso : `${iso}Z`);
    date = Number.isNaN(parsed.getTime()) ? null : parsed;
  } else if (/[a-z]/i.test(text)) {
    const parsed = new Date(`${text} 12:00 UTC`);
    const fallback = Number.isNaN(parsed.getTime()) ? new Date(text) : parsed;
    date = Number.isNaN(fallback.getTime()) ? null : fallback;
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
