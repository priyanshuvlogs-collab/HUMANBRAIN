// Validation for real results (shared by the results form and CSV import) and
// Performance Index recalculation when averages change.
import * as z from "zod";
import type { Goal } from "./constants";
import { METRIC_KEYS, METRIC_LABELS, averageKey, computePerformanceIndex, type MetricKey, type Metrics } from "./performance";

/** "12,000" → 12000, "62%" → 62, "$97" → 97, "" → null. */
export function parseNumberInput(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value === "number") return value;
  if (typeof value !== "string") return value;
  const cleaned = value.replace(/[,%$\s]/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  return Number(cleaned);
}

export function optionalNumber(label: string, max?: number) {
  return z.preprocess(
    parseNumberInput,
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
  let updated = 0;
  for (let from = 0; ; from += PAGE) {
    const { data: rows, error } = await supabase
      .from("results")
      .select(
        "id, performance_index, views, hold_3s_pct, avg_watch_pct, likes, comments, saves, shares, dms, link_clicks, leads, sales, posts!inner(goal, platform)",
      )
      .eq("user_id", userId)
      .in("posts.platform", platforms)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) {
      console.error("[results] recompute load failed:", error);
      return updated;
    }
    for (const row of rows ?? []) {
      const metrics = toNumberRecord(row) as Metrics;
      const pi = computePerformanceIndex(row.posts.goal as Goal, metrics, averagesByPlatform.get(row.posts.platform) ?? null);
      const current = row.performance_index == null ? null : Number(row.performance_index);
      if (pi === current) continue;
      const { error: updateError } = await supabase.from("results").update({ performance_index: pi }).eq("id", row.id);
      if (updateError) console.error("[results] recompute update failed:", updateError);
      else updated++;
    }
    if (!rows || rows.length < PAGE) return updated;
  }
}
