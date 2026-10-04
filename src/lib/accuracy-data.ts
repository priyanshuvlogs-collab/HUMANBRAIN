import "server-only";
import type { AccuracyPoint } from "./accuracy";
import type { CurrentUser } from "./auth";
import { SCORE_CATEGORIES, TIERS, type ScoreCategory, type Tier } from "./constants";
import { tierForPerformanceIndex } from "./performance";
import { SCHEMA_VERSION } from "./schema";

const PAGE = 1000; // Supabase returns at most 1,000 rows per request

export type AccuracyData = {
  points: AccuracyPoint[];
  /** Reviewed posts with no results logged yet. */
  awaitingResults: number;
  /** Reviewed posts with results but no Performance Index (averages missing for their metrics). */
  needsAverages: number;
  /** Posts with results but no review (e.g. CSV imports): they can't be compared with a prediction. */
  notReviewed: number;
  /** True when a query failed: the page shows an error instead of numbers from partial data. */
  error: boolean;
};

export function categoryScoresFrom(scores: unknown): Partial<Record<ScoreCategory, number>> | null {
  if (!scores || typeof scores !== "object") return null;
  const out: Partial<Record<ScoreCategory, number>> = {};
  for (const c of SCORE_CATEGORIES) {
    const value = (scores as Record<string, { score?: unknown } | undefined>)[c]?.score;
    const n = typeof value === "number" ? value : Number(value);
    if (value != null && Number.isFinite(n)) out[c] = n;
  }
  return Object.keys(out).length ? out : null;
}

/** The shape of one row from the points query below. */
export type AccuracyRow = {
  id: string;
  platform: string;
  format: string;
  goal: string;
  hook: string;
  posted_at: string | null;
  reviews: { total_score: number | string; predicted_tier: string; schema_version: number; created_at: string; scores: unknown }[];
  latest_results: { performance_index: number | string | null }[];
};

/**
 * One row → one point: the post's newest review (the prediction) vs its newest saved result.
 * "needsAverages" when the result has no Performance Index; null when it can't be compared.
 */
export function rowToPoint(row: AccuracyRow): AccuracyPoint | "needsAverages" | null {
  const review = [...row.reviews].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (!review || row.latest_results.length === 0) return null;
  const piRaw = row.latest_results[0].performance_index;
  if (piRaw == null || piRaw === "") return "needsAverages";
  const pi = Number(piRaw);
  const score = Number(review.total_score);
  const predictedTier = review.predicted_tier as Tier;
  const actualTier = tierForPerformanceIndex(pi);
  if (!Number.isFinite(pi) || !Number.isFinite(score) || !TIERS.includes(predictedTier) || !actualTier) return null;
  return {
    postId: row.id,
    platform: row.platform,
    format: row.format,
    goal: row.goal,
    hook: row.hook,
    postedAt: row.posted_at,
    score,
    predictedTier,
    pi,
    actualTier,
    categoryScores: review.schema_version === SCHEMA_VERSION ? categoryScoresFrom(review.scores) : null,
  };
}

/**
 * Every reviewed post that has real results, as one point. Optionally limited to one platform.
 */
export async function loadAccuracyData(
  supabase: CurrentUser["supabase"],
  userId: string,
  platform: string | null,
): Promise<AccuracyData> {
  const points: AccuracyPoint[] = [];
  let needsAverages = 0;
  let failed = false;

  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from("posts")
      .select(
        // scores:parsed->scores pulls just the scorecard out of the stored review JSON
        "id, platform, format, goal, hook, posted_at, reviews!inner(total_score, predicted_tier, schema_version, created_at, scores:parsed->scores), latest_results!inner(performance_index)",
      )
      .eq("user_id", userId);
    if (platform) query = query.eq("platform", platform);
    const { data, error } = await query.order("id").range(from, from + PAGE - 1);
    if (error) {
      console.error("[accuracy] load failed:", error);
      failed = true;
      break;
    }
    for (const row of data as AccuracyRow[]) {
      const point = rowToPoint(row);
      if (point === "needsAverages") needsAverages++;
      else if (point) points.push(point);
    }
    if (data.length < PAGE) break;
  }

  // Counts for the "not included" notes (head: true = count only, no rows).
  // Waiting = published but no results yet (unpublished drafts and unused versions don't count).
  let awaiting = supabase
    .from("posts")
    .select("id, reviews!inner(id), results(id)", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "posted")
    .is("results", null);
  let unreviewed = supabase
    .from("posts")
    .select("id, results!inner(id), reviews(id)", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("reviews", null);
  if (platform) {
    awaiting = awaiting.eq("platform", platform);
    unreviewed = unreviewed.eq("platform", platform);
  }
  const [awaitingRes, unreviewedRes] = await Promise.all([awaiting, unreviewed]);
  if (awaitingRes.error || unreviewedRes.error) {
    console.error("[accuracy] count failed:", awaitingRes.error ?? unreviewedRes.error);
    failed = true;
  }

  return {
    points,
    awaitingResults: awaitingRes.count ?? 0,
    needsAverages,
    notReviewed: unreviewedRes.count ?? 0,
    error: failed,
  };
}
