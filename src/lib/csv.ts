/**
 * CSV import of past posts with their real results. Pure functions, used in the browser
 * (preview) AND on the server (which re-checks every row before saving).
 */
import Papa from "papaparse";
import { GOAL_KEYS, PLATFORMS, type Goal, type Platform } from "./constants";
import { detectDateOrder, parseDateInput, type DateOrder } from "./dates";
import { METRIC_KEYS, type MetricKey, type Metrics } from "./performance";
import { hasAnyMetric, metricsSchema, parseNumberInput } from "./results";

export const CSV_COLUMNS = [
  "platform",
  "format",
  "goal",
  "hook",
  "script",
  "on_screen_text",
  "posted_at",
  ...METRIC_KEYS,
] as const;
export type CsvColumn = (typeof CSV_COLUMNS)[number];

export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
/** Rows per server call (also capped by size, to stay under the 1 MB Server Action limit). */
export const IMPORT_BATCH_ROWS = 200;
export const IMPORT_BATCH_BYTES = 500_000;

// Common names people (and platform exports) use for each column.
const HEADER_ALIASES: Record<string, CsvColumn> = {
  network: "platform",
  channel: "platform",
  type: "format",
  post_type: "format",
  media_type: "format",
  objective: "goal",
  first_line: "hook",
  title: "hook",
  caption: "script",
  description: "script",
  script_caption: "script",
  on_screen: "on_screen_text",
  onscreen_text: "on_screen_text",
  text_on_screen: "on_screen_text",
  date: "posted_at",
  date_posted: "posted_at",
  posted_date: "posted_at",
  published: "posted_at",
  published_on: "posted_at",
  upload_date: "posted_at",
  uploaded: "posted_at",
  posted: "posted_at",
  posted_on: "posted_at",
  post_date: "posted_at",
  publish_date: "posted_at",
  publish_time: "posted_at",
  published_at: "posted_at",
  view: "views",
  plays: "views",
  reach: "views",
  video_views: "views",
  hold_3s: "hold_3s_pct",
  "3s_hold": "hold_3s_pct",
  "3s_hold_pct": "hold_3s_pct",
  "3_sec_hold": "hold_3s_pct",
  "3_sec_hold_pct": "hold_3s_pct",
  hold_rate: "hold_3s_pct",
  hold_rate_pct: "hold_3s_pct",
  hold_3s_rate: "hold_3s_pct",
  avg_watch: "avg_watch_pct",
  avg_watch_time_pct: "avg_watch_pct",
  watch_rate: "avg_watch_pct",
  watch_pct: "avg_watch_pct",
  average_watch_pct: "avg_watch_pct",
  average_percentage_viewed: "avg_watch_pct",
  like: "likes",
  comment: "comments",
  save: "saves",
  share: "shares",
  dm: "dms",
  messages: "dms",
  clicks: "link_clicks",
  link_click: "link_clicks",
  link_taps: "link_clicks",
  website_clicks: "link_clicks",
  lead: "leads",
  sale: "sales",
  purchases: "sales",
  orders: "sales",
};

const COLUMN_SET = new Set<string>(CSV_COLUMNS);

/** "Avg Watch %" → "avg_watch_pct", "3-sec hold" → "hold_3s_pct"; unknown headers come back cleaned. */
export function normalizeHeader(header: string): string {
  const cleaned = header
    .replace(/^﻿/, "")
    .trim()
    .toLowerCase()
    .replace(/%/g, " pct ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_pct_pct$/, "_pct");
  if (COLUMN_SET.has(cleaned)) return cleaned;
  return HEADER_ALIASES[cleaned] ?? cleaned;
}

export type HeaderCheck = {
  errors: string[];
  warnings: string[];
  /** Original header names that aren't used. */
  ignored: string[];
};

/** File-level problems (missing required columns), warnings, and the columns that will be ignored. */
export function checkHeaders(originalHeaders: string[]): HeaderCheck {
  const mapped = originalHeaders.map(normalizeHeader);
  const present = new Set(mapped);
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!present.has("platform")) errors.push('Missing a "platform" column.');
  if (!present.has("goal")) errors.push('Missing a "goal" column.');
  if (!present.has("hook") && !present.has("script")) errors.push('Missing a "hook" column (or a "script"/caption column).');
  if (!METRIC_KEYS.some((k) => present.has(k))) errors.push("No metric columns found (views, likes, saves, DMs…).");
  if (!present.has("posted_at")) {
    warnings.push('No date column found (e.g. "posted_at"), so posts will be imported without a posted date.');
  }
  for (const column of CSV_COLUMNS) {
    const sources = originalHeaders.filter((_, i) => mapped[i] === column);
    if (sources.length > 1) {
      warnings.push(`${sources.map((h) => `"${h.trim()}"`).join(" and ")} all count as ${column}; the first filled-in one is used.`);
    }
  }
  const ignored = originalHeaders.filter((h, i) => h.trim() && !COLUMN_SET.has(mapped[i])).map((h) => h.trim());
  return { errors, warnings, ignored };
}

const PLATFORM_ALIASES: Record<string, Platform> = {
  instagram: "instagram",
  ig: "instagram",
  insta: "instagram",
  tiktok: "tiktok",
  tt: "tiktok",
  youtube: "youtube",
  youtubeshorts: "youtube",
  yt: "youtube",
  ytshorts: "youtube",
  shorts: "youtube",
};

const FORMAT_ALIASES: Record<Platform, Record<string, string>> = {
  instagram: {
    reel: "reel",
    reels: "reel",
    video: "reel",
    carousel: "carousel",
    carousels: "carousel",
    album: "carousel",
    post: "post",
    photo: "post",
    image: "post",
    single: "post",
    feed: "post",
    story: "story",
    stories: "story",
  },
  tiktok: {
    video: "video",
    videos: "video",
    carousel: "carousel",
    photo: "carousel",
    photomode: "carousel",
    slideshow: "carousel",
  },
  youtube: { short: "short", shorts: "short", video: "short" },
};

/** Blank format → the platform's main video format. */
const DEFAULT_FORMAT: Record<Platform, string> = { instagram: "reel", tiktok: "video", youtube: "short" };

const GOAL_ALIASES: Record<string, Goal> = {
  view: "views",
  reach: "views",
  awareness: "views",
  engage: "engagement",
  engagements: "engagement",
  community: "engagement",
  lead: "leads",
  dm: "leads",
  dms: "leads",
  sale: "sales",
  sell: "sales",
  conversion: "sales",
  conversions: "sales",
};

const key = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z]/g, "");
const str = (v: unknown) => (v == null ? "" : String(v)).trim();

export type ImportRow = {
  platform: Platform;
  format: string;
  goal: Goal;
  hook: string;
  script: string;
  on_screen_text: string;
  posted_at: string | null;
  metrics: Metrics;
};

export type RowCheck = { line: number; ok: true; row: ImportRow } | { line: number; ok: false; errors: string[] };

/** File-wide reading rules, decided once in the browser and sent with every batch. */
export type ImportOptions = { dateOrder: DateOrder; decimalComma: boolean };
export const DEFAULT_IMPORT_OPTIONS: ImportOptions = { dateOrder: "mdy", decimalComma: false };

/** Cuts a caption's first line down to hook length at a word boundary. */
function shortenHook(text: string): string {
  if (text.length <= 500) return text;
  const cut = text.slice(0, 499);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 400 ? cut.lastIndexOf(" ") : 499).trimEnd()}…`;
}

/** Checks and cleans one CSV row (keys already normalised). `line` is the spreadsheet row number. */
export function validateCsvRow(
  raw: Record<string, unknown>,
  line: number,
  options: ImportOptions = DEFAULT_IMPORT_OPTIONS,
  now: Date = new Date(),
): RowCheck {
  const errors: string[] = [];

  const platform = PLATFORM_ALIASES[key(raw.platform)];
  if (!platform) errors.push(str(raw.platform) ? `Unknown platform "${str(raw.platform)}" (use instagram, tiktok or youtube).` : "Platform is missing.");

  let format = "";
  if (platform) {
    const given = key(raw.format);
    format = given ? (FORMAT_ALIASES[platform][given] ?? "") : DEFAULT_FORMAT[platform];
    if (!format) {
      const options = Object.keys(PLATFORMS[platform].formats).join(", ");
      errors.push(`Unknown ${PLATFORMS[platform].label} format "${str(raw.format)}" (use ${options}).`);
    }
  }

  const goalKey = key(raw.goal);
  const goal = (GOAL_KEYS as string[]).includes(goalKey) ? (goalKey as Goal) : GOAL_ALIASES[goalKey];
  if (!goal) errors.push(goalKey ? `Unknown goal "${str(raw.goal)}" (use views, engagement, leads or sales).` : "Goal is missing (views, engagement, leads or sales).");

  const script = str(raw.script);
  // No hook column value? Use the first line of the caption/script (shortened if needed).
  const givenHook = str(raw.hook);
  const hook = givenHook || shortenHook((script.split(/\r?\n/).find((l) => l.trim()) ?? "").trim());
  if (!hook) errors.push("Hook is missing (and there's no script/caption to take it from).");
  else if (hook.length > 500) errors.push("Hook is too long (max 500 characters).");
  if (script.length > 10_000) errors.push("Script is too long (max 10,000 characters).");
  const onScreen = str(raw.on_screen_text);
  if (onScreen.length > 2_000) errors.push("On-screen text is too long (max 2,000 characters).");

  const posted = parseDateInput(raw.posted_at, "Posted date", now, { order: options.dateOrder });
  if (!posted.ok) errors.push(posted.error);

  const metricInput = Object.fromEntries(
    METRIC_KEYS.map((k) => [k, parseNumberInput(raw[k] ?? null, { decimalComma: options.decimalComma })]),
  );
  const metrics = metricsSchema.safeParse(metricInput);
  if (!metrics.success) errors.push(...new Set(metrics.error.issues.map((i) => i.message)));
  else if (!hasAnyMetric(metrics.data)) errors.push("No numbers — add at least one metric (views, likes, DMs…).");

  if (errors.length || !platform || !goal || !metrics.success || !posted.ok) return { line, ok: false, errors };
  return {
    line,
    ok: true,
    row: {
      platform,
      format,
      goal,
      hook,
      script,
      on_screen_text: onScreen,
      posted_at: posted.value,
      metrics: Object.fromEntries(METRIC_KEYS.map((k) => [k, metrics.data[k] ?? null])) as Record<MetricKey, number | null>,
    },
  };
}

export type CsvRecord = {
  /** Spreadsheet row number (the header is row 1). */
  line: number;
  /** Only the known columns; columns that map to the same field are merged (first filled-in wins). */
  data: Partial<Record<CsvColumn, string>>;
  /** Problems found while splitting the row into cells. */
  problems: string[];
};

export type ParsedCsv = {
  headers: string[];
  records: CsvRecord[];
  options: ImportOptions;
};

// Bytes 0x80–0x9F in windows-1252 (curly quotes, dashes, €…). Other bytes match Unicode directly.
const CP1252 = "€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ";

/** Excel on Windows saves "CSV" in windows-1252, not UTF-8: decode bytes either way. */
export function decodeCsvBytes(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(view);
  } catch {
    let text = "";
    for (const b of view) text += b >= 0x80 && b < 0xa0 ? CP1252[b - 0x80] : String.fromCharCode(b);
    return text;
  }
}

/** Splits CSV text into rows (header first), keeping real spreadsheet row numbers and cell problems. */
export function parseCsvText(text: string): ParsedCsv {
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), { header: false, skipEmptyLines: false });
  const [headerRow = [], ...rows] = parsed.data;
  const headers = headerRow.map((h) => String(h ?? ""));
  const mapped = headers.map(normalizeHeader);

  const problemsByRow = new Map<number, string[]>();
  for (const e of parsed.errors) {
    if (e.row == null) continue;
    const message =
      e.code === "MissingQuotes"
        ? 'A quote (") is opened but never closed, so the rest of the file was read as one cell. Check the quotes in this row.'
        : `This row couldn't be read cleanly (${e.message}).`;
    problemsByRow.set(e.row, [...(problemsByRow.get(e.row) ?? []), message]);
  }

  const records: CsvRecord[] = [];
  rows.forEach((cells, i) => {
    if (!cells.some((c) => String(c ?? "").trim())) return; // blank row
    const data: Partial<Record<CsvColumn, string>> = {};
    mapped.forEach((column, c) => {
      const value = String(cells[c] ?? "").trim();
      if (COLUMN_SET.has(column) && value && !data[column as CsvColumn]) data[column as CsvColumn] = value;
    });
    const problems = [...(problemsByRow.get(i + 1) ?? [])];
    const extra = cells.slice(headers.length).filter((c) => String(c ?? "").trim());
    if (extra.length) {
      problems.push(
        `This row has more cells than the header (${cells.length} vs ${headers.length}). A comma inside some text probably needs quotes around it.`,
      );
    }
    records.push({ line: i + 2, data, problems });
  });

  const options: ImportOptions = {
    dateOrder: detectDateOrder(records.map((r) => r.data.posted_at)),
    // "1.234,5" style numbers come with ";" between cells.
    decimalComma: parsed.meta.delimiter === ";",
  };
  return { headers, records, options };
}

/** Checks a parsed record, including problems found while splitting it into cells. */
export function checkRecord(record: CsvRecord, options: ImportOptions, now: Date = new Date()): RowCheck {
  const check = validateCsvRow(record.data, record.line, options, now);
  if (!record.problems.length) return check;
  return { line: record.line, ok: false, errors: [...record.problems, ...(check.ok ? [] : check.errors)] };
}

const byteLength = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

/** Splits rows into batches small enough for one Server Action call (counted in bytes, like the limit). */
export function chunkRows<T>(rows: T[], maxRows = IMPORT_BATCH_ROWS, maxBytes = IMPORT_BATCH_BYTES): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  let bytes = 0;
  for (const row of rows) {
    const size = byteLength(row);
    if (current.length && (current.length >= maxRows || bytes + size > maxBytes)) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push(row);
    bytes += size;
  }
  if (current.length) batches.push(current);
  return batches;
}

/** Same post already in Offer Brain? Matched on platform + hook, and the posted day when both have one. */
export type DuplicateIndex = Map<string, Set<string>>;

const hookKey = (platform: string, hook: string) => `${platform}|${hook.toLowerCase().replace(/\s+/g, " ").trim()}`;
const dayOf = (iso: string | null) => iso?.slice(0, 10) ?? "";

export function addToDuplicateIndex(index: DuplicateIndex, post: { platform: string; hook: string; posted_at: string | null }) {
  const k = hookKey(post.platform, post.hook);
  const days = index.get(k) ?? new Set<string>();
  days.add(dayOf(post.posted_at));
  index.set(k, days);
}

export function isDuplicate(index: DuplicateIndex, post: { platform: string; hook: string; posted_at: string | null }): boolean {
  const days = index.get(hookKey(post.platform, post.hook));
  if (!days) return false;
  const day = dayOf(post.posted_at);
  // Same day, or one side has no date (e.g. a file re-imported after adding a date column).
  return days.has(day) || days.has("") || day === "";
}

/** The downloadable template: every column plus two example rows. */
export function templateCsv(): string {
  return Papa.unparse({
    fields: [...CSV_COLUMNS],
    data: [
      [
        "instagram", "reel", "leads", "I made $3,000 in 30 days with one DM keyword",
        "Here's the exact script I used...", 'DM "PLAN" for the template', "2026-09-14",
        "12000", "62", "38", "540", "48", "210", "95", "31", "", "12", "",
      ],
      [
        "tiktok", "video", "views", "Stop posting at 9am", "Most creators post when they're free, not when their audience is.",
        "", "2026-09-20", "25000", "55", "41", "1200", "80", "150", "60", "", "", "", "",
      ],
    ],
  });
}
