/**
 * CSV import of past posts with their real results. Pure functions, used in the browser
 * (preview) AND on the server (which re-checks every row before saving).
 */
import Papa from "papaparse";
import { GOAL_KEYS, PLATFORMS, type Goal, type Platform } from "./constants";
import { parseDateInput } from "./dates";
import { METRIC_KEYS, type MetricKey, type Metrics } from "./performance";
import { hasAnyMetric, metricsSchema } from "./results";

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
  avg_watch: "avg_watch_pct",
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
  return HEADER_ALIASES[cleaned] ?? HEADER_ALIASES[cleaned.replace(/_pct$/, "")] ?? cleaned;
}

/** File-level problems (missing required columns) and the columns that will be ignored. */
export function checkHeaders(headers: string[]): { errors: string[]; ignored: string[] } {
  const present = new Set(headers);
  const errors: string[] = [];
  if (!present.has("platform")) errors.push('Missing a "platform" column.');
  if (!present.has("goal")) errors.push('Missing a "goal" column.');
  if (!present.has("hook") && !present.has("script")) errors.push('Missing a "hook" column (or a "script"/caption column).');
  if (!METRIC_KEYS.some((k) => present.has(k))) errors.push("No metric columns found (views, likes, saves, DMs…).");
  return { errors, ignored: headers.filter((h) => h && !COLUMN_SET.has(h)) };
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

/** Checks and cleans one CSV row (keys already normalised). `line` is the spreadsheet row number. */
export function validateCsvRow(raw: Record<string, unknown>, line: number, now: Date = new Date()): RowCheck {
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
  // No hook column value? Use the first line of the caption/script.
  const hook = str(raw.hook) || (script.split(/\r?\n/).find((l) => l.trim()) ?? "").trim();
  if (!hook) errors.push("Hook is missing (and there's no script/caption to take it from).");
  else if (hook.length > 500) errors.push("Hook is too long (max 500 characters).");
  if (script.length > 10_000) errors.push("Script is too long (max 10,000 characters).");
  const onScreen = str(raw.on_screen_text);
  if (onScreen.length > 2_000) errors.push("On-screen text is too long (max 2,000 characters).");

  const posted = parseDateInput(raw.posted_at, "Posted date", now);
  if (!posted.ok) errors.push(posted.error);

  const metricInput = Object.fromEntries(METRIC_KEYS.map((k) => [k, raw[k] ?? null]));
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

/** Parses CSV text (header row first) into normalised records. */
export function parseCsvText(text: string): { headers: string[]; records: Record<string, string>[] } {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: normalizeHeader,
  });
  return { headers: parsed.meta.fields ?? [], records: parsed.data };
}

/** Splits rows into batches small enough for one Server Action call. */
export function chunkRows<T>(rows: T[], maxRows = IMPORT_BATCH_ROWS, maxBytes = IMPORT_BATCH_BYTES): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  let bytes = 0;
  for (const row of rows) {
    const size = JSON.stringify(row).length;
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

/** Same post imported twice? Matched on platform + hook + posted day. */
export function duplicateKey(row: { platform: string; hook: string; posted_at: string | null }): string {
  return [row.platform, row.hook.toLowerCase().replace(/\s+/g, " ").trim(), row.posted_at?.slice(0, 10) ?? ""].join("|");
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
