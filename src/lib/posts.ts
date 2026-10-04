import "server-only";
import type { CurrentUser } from "./auth";
import { METRIC_KEYS, type Metrics } from "./performance";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A learning note stuck in "pending" this long is treated as failed (the background job was cut off). */
export const STALE_PENDING_MS = 6 * 60 * 1000;

const newestFirst = <T extends { created_at: string }>(rows: T[]) =>
  [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));

export function metricsOf(row: Record<string, unknown>): Metrics {
  return Object.fromEntries(METRIC_KEYS.map((k) => [k, row[k] == null ? null : Number(row[k])]));
}

/** One post with its reviews, results history and learning notes (RLS: only the signed-in user's). */
export async function loadPostDetail(supabase: CurrentUser["supabase"], postId: string) {
  if (!UUID.test(postId)) return null;
  const { data, error } = await supabase
    .from("posts")
    .select(
      "*, offers(name), reviews(id, total_score, predicted_tier, confidence, created_at), results(*), calibration_notes(*)",
    )
    .eq("id", postId)
    .maybeSingle();
  if (error) console.error("[posts] load failed:", error);
  if (!data) return null;

  const { reviews, results, calibration_notes, offers, ...post } = data;
  const sortedResults = [...results].sort(
    (a, b) => b.collected_at.localeCompare(a.collected_at) || b.created_at.localeCompare(a.created_at),
  );
  return {
    post,
    offerName: offers?.name ?? null,
    latestReview: newestFirst(reviews)[0] ?? null,
    results: sortedResults,
    notes: newestFirst(calibration_notes),
  };
}

export type PostDetail = NonNullable<Awaited<ReturnType<typeof loadPostDetail>>>;
export type CalibrationNoteRow = PostDetail["notes"][number];

/** All posts, newest first, with their latest review score and latest Performance Index. */
export async function loadPostList(supabase: CurrentUser["supabase"], userId: string) {
  const { data, error } = await supabase
    .from("posts")
    .select(
      "id, hook, platform, format, goal, status, source, posted_at, created_at, root_post_id, reviews(total_score, predicted_tier, created_at), results(performance_index, collected_at, created_at)",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) console.error("[posts] list failed:", error);
  return (data ?? []).map(({ reviews, results, ...post }) => {
    const review = newestFirst(reviews)[0] ?? null;
    const result =
      [...results].sort(
        (a, b) => b.collected_at.localeCompare(a.collected_at) || b.created_at.localeCompare(a.created_at),
      )[0] ?? null;
    return {
      ...post,
      score: review ? Number(review.total_score) : null,
      predictedTier: review?.predicted_tier ?? null,
      performanceIndex: result?.performance_index == null ? null : Number(result.performance_index),
      resultsCount: results.length,
    };
  });
}
