/**
 * Performance Index: how a post did compared with YOUR averages on that platform.
 * 1.0 = average, 2.0 = double, 0.5 = half.
 *
 * Each metric becomes a ratio (actual ÷ your average, capped at 10× so one viral
 * outlier can't dominate), then the ratios are combined with weights that depend on
 * the post's goal. Metrics you didn't record (or have no average for) are skipped and
 * the remaining weights are re-scaled, so a missing number never drags the score down.
 */
import type { Goal, Tier } from "./constants";

export const METRIC_KEYS = [
  "views",
  "hold_3s_pct",
  "avg_watch_pct",
  "likes",
  "comments",
  "saves",
  "shares",
  "dms",
  "link_clicks",
  "leads",
  "sales",
] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

export type Metrics = Partial<Record<MetricKey, number | null>>;

/** Averages use the same names with an "avg_" prefix (avg_watch_pct is already prefixed). */
export type Averages = Partial<Record<string, number | null>>;

export const METRIC_LABELS: Record<MetricKey, string> = {
  views: "Views / reach",
  hold_3s_pct: "3-sec hold %",
  avg_watch_pct: "Avg watch %",
  likes: "Likes",
  comments: "Comments",
  saves: "Saves",
  shares: "Shares",
  dms: "DMs",
  link_clicks: "Link clicks",
  leads: "Leads",
  sales: "Sales",
};

/** Which metrics matter for each goal, and how much (weights add up to 1). */
export const GOAL_WEIGHTS: Record<Goal, Partial<Record<MetricKey, number>>> = {
  views: { views: 0.6, avg_watch_pct: 0.4 },
  engagement: { comments: 0.3, saves: 0.25, shares: 0.25, likes: 0.2 },
  leads: { dms: 0.5, link_clicks: 0.3, leads: 0.2 },
  sales: { sales: 0.5, leads: 0.2, dms: 0.15, link_clicks: 0.15 },
};

export const MAX_RATIO = 10;

export function averageKey(metric: MetricKey): string {
  return metric === "avg_watch_pct" ? "avg_watch_pct" : `avg_${metric}`;
}

/** The weighted Performance Index, rounded to 2 decimals — or null if nothing usable was recorded. */
export function computePerformanceIndex(goal: Goal, metrics: Metrics, averages: Averages | null): number | null {
  if (!averages) return null;
  const weights = GOAL_WEIGHTS[goal];
  let weighted = 0;
  let usedWeight = 0;
  for (const [metric, weight] of Object.entries(weights) as [MetricKey, number][]) {
    const actual = metrics[metric];
    const average = averages[averageKey(metric)];
    if (actual == null || !Number.isFinite(actual) || average == null || !(average > 0)) continue;
    const ratio = Math.min(MAX_RATIO, Math.max(0, actual) / average);
    weighted += ratio * weight;
    usedWeight += weight;
  }
  if (usedWeight === 0) return null;
  return Math.round((weighted / usedWeight) * 100) / 100;
}

/** Plain-English label for a Performance Index. */
export function describePerformanceIndex(pi: number | null): string {
  if (pi == null) return "Not enough data";
  if (pi >= 2) return "Breakout";
  if (pi >= 1.2) return "Above average";
  if (pi >= 0.8) return "About average";
  return "Below average";
}

/** The tier a Performance Index corresponds to (same bands the learning prompt uses). */
export function tierForPerformanceIndex(pi: number | null): Tier | null {
  if (pi == null) return null;
  if (pi >= 2) return "BREAKOUT";
  if (pi >= 1.2) return "ABOVE";
  if (pi >= 0.8) return "AVERAGE";
  return "BELOW";
}
