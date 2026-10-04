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
};

function categoryScoresFrom(scores: unknown): Partial<Record<ScoreCategory, number>> | null {
  if (!scores || typeof scores !== "object") return null;
  const out: Partial<Record<ScoreCategory, number>> = {};
  for (const c of SCORE_CATEGORIES) {
    const value = (scores as Record<string, { score?: unknown } | undefined>)[c]?.score;
    const n = typeof value === "number" ? value : Number(value);
    if (value != null && Number.isFinite(n)) out[c] = n;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Every reviewed post that has real results, as one point: its newest review (the prediction)
 * and its newest saved result (what happened). Optionally limited to one platform.
 */
export async function loadAccuracyData(
  supabase: CurrentUser["supabase"],
  userId: string,
  platform: string | null,
): Promise<AccuracyData> {
  const points: AccuracyPoint[] = [];
  let needsAverages = 0;

  for (let from = 0; from < 50 * PAGE; from += PAGE) {
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
      break;
    }
    for (const post of data) {
      const review = [...post.reviews].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      const piRaw = post.latest_results[0]?.performance_index;
      if (!review) continue;
      if (piRaw == null) {
        needsAverages++;
        continue;
      }
      const pi = Number(piRaw);
      const predictedTier = review.predicted_tier as Tier;
      const actualTier = tierForPerformanceIndex(pi);
      if (!TIERS.includes(predictedTier) || !actualTier) continue;
      points.push({
        postId: post.id,
        platform: post.platform,
        format: post.format,
        goal: post.goal,
        hook: post.hook,
        postedAt: post.posted_at,
        score: Number(review.total_score),
        predictedTier,
        pi,
        actualTier,
        categoryScores: review.schema_version === SCHEMA_VERSION ? categoryScoresFrom(review.scores) : null,
      });
    }
    if (data.length < PAGE) break;
  }

  // Counts for the "not included" notes (head: true = count only, no rows).
  let awaiting = supabase
    .from("posts")
    .select("id, reviews!inner(id), results(id)", { count: "exact", head: true })
    .eq("user_id", userId)
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
  }

  return {
    points,
    awaitingResults: awaitingRes.count ?? 0,
    needsAverages,
    notReviewed: unreviewedRes.count ?? 0,
  };
}
