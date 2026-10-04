// Validation for real results (shared by the results form and CSV import) and
// Performance Index recalculation when averages change.
import * as z from "zod";
import type { Goal } from "./constants";
import { METRIC_KEYS, METRIC_LABELS, averageKey, computePerformanceIndex, type MetricKey, type Metrics } from "./performance";

const BLANK_WORDS = new Set(["", "-", "–", "—", "na", "n/a", "none", "null"]);

/**
 * "12,000" → 12000, "62%" → 62, "$97" → 97, "1.2K" → 1200, "3M" → 3000000, "" / "N/A" → null.
 * With `decimalComma` (European CSVs that use ";" between cells): "12.000" → 12000, "62,5" → 62.5.
 */
export function parseNumberInput(value: unknown, options: { decimalComma?: boolean } = {}): unknown {
  if (value == null) return null;
  if (typeof value === "number") return value;
  if (typeof value !== "string") return value;
  let cleaned = value.trim().replace(/[%$€£₹\s]/g, "");
  if (BLANK_WORDS.has(cleaned.toLowerCase())) return null;
  cleaned = options.decimalComma ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/,/g, "");
  const suffix = cleaned.match(/^(\d+(?:\.\d+)?)([kKmM])$/);
  if (suffix) return Math.round(Number(suffix[1]) * (suffix[2].toLowerCase() === "k" ? 1_000 : 1_000_000));
  return Number(cleaned);
}

export function optionalNumber(label: string, max?: number) {
  return z.preprocess(
    (v) => parseNumberInput(v),
    z
      .number({ error: `${label}: use numbers only.` })
      .refine(Number.isFinite, `${label}: use numbers only.`)
      .min(0, `${label} can't be negative.`)
      .max(max ?? Number.MAX_SAFE_INTEGER, max ? `${label} must be ${max} or less.` : `${label} is too large.`)
      .nullable(),
  );
}

const maxFor = (key: MetricKey) => (key.endsWith("_pct") ? 100 : undefined);

/** One post's real metrics; every field optional ("" → null). */
export const metricsSchema = z.object(
  Object.fromEntries(METRIC_KEYS.map((key) => [key, optionalNumber(METRIC_LABELS[key], maxFor(key))])) as Record<
    MetricKey,
    ReturnType<typeof optionalNumber>
  >,
);

/** "My average" per platform: same metrics, stored as avg_views, avg_watch_pct, … */
export const averagesSchema = z.object(
  Object.fromEntries(
    METRIC_KEYS.map((key) => [averageKey(key), optionalNumber(`Average ${METRIC_LABELS[key].toLowerCase()}`, maxFor(key))]),
  ) as Record<string, ReturnType<typeof optionalNumber>>,
);

export function hasAnyMetric(metrics: Metrics): boolean {
  return METRIC_KEYS.some((k) => metrics[k] != null);
}

/** Supabase numeric columns may arrive as strings; normalise a row to plain numbers. */
export function toNumberRecord(row: Record<string, unknown> | null | undefined): Record<string, number | null> | null {
  if (!row) return null;
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k, v == null || v === "" ? null : typeof v === "number" ? v : Number(v)]),
  ) as Record<string, number | null>;
}

type SupabaseLike = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

/**
 * Recomputes the Performance Index of every result on the given platforms
 * (call after the user changes their averages). Only rows whose value changes are written.
 */
export async function recomputePerformanceIndexes(supabase: SupabaseLike, userId: string, platforms: string[]) {
  if (platforms.length === 0) return 0;
  const { data: averagesRows } = await supabase
    .from("platform_averages")
    .select("*")
    .eq("user_id", userId)
    .in("platform", platforms);
  const averagesByPlatform = new Map<string, Record<string, number | null> | null>(
    (averagesRows ?? []).map((a: { platform: string }) => [a.platform, toNumberRecord(a as Record<string, unknown>)]),
  );

  const PAGE = 1000; // Supabase returns at most 1,000 rows per request
  const changed: { id: string; user_id: string; post_id: string; performance_index: number | null }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data: rows, error } = await supabase
      .from("results")
      .select(
        "id, user_id, post_id, performance_index, views, hold_3s_pct, avg_watch_pct, likes, comments, saves, shares, dms, link_clicks, leads, sales, posts!inner(goal, platform)",
      )
      .eq("user_id", userId)
      .in("posts.platform", platforms)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) {
      console.error("[results] recompute load failed:", error);
      return 0;
    }
    for (const row of rows ?? []) {
      const metrics = toNumberRecord(row) as Metrics;
      const pi = computePerformanceIndex(row.posts.goal as Goal, metrics, averagesByPlatform.get(row.posts.platform) ?? null);
      const current = row.performance_index == null ? null : Number(row.performance_index);
      if (pi !== current) changed.push({ id: row.id, user_id: row.user_id, post_id: row.post_id, performance_index: pi });
    }
    if (!rows || rows.length < PAGE) break;
  }

  // Write the new values in a few bulk requests (an upsert on id only touches performance_index).
  let updated = 0;
  for (let i = 0; i < changed.length; i += 500) {
    const chunk = changed.slice(i, i + 500);
    const { error } = await supabase.from("results").upsert(chunk, { onConflict: "id" });
    if (error) console.error("[results] recompute update failed:", error);
    else updated += chunk.length;
  }
  return updated;
}
