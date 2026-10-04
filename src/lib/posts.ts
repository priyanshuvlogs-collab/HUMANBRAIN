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
  return {
    post,
    offerName: offers?.name ?? null,
    latestReview: newestFirst(reviews)[0] ?? null,
    results: newestFirst(results), // the newest save is the one that counts
    notes: newestFirst(calibration_notes),
  };
}

export type PostDetail = NonNullable<Awaited<ReturnType<typeof loadPostDetail>>>;
export type CalibrationNoteRow = PostDetail["notes"][number];

export const POSTS_PER_PAGE = 100;

/**
 * One page of posts with their latest review score and current Performance Index.
 * Drafts first, then posted posts by date posted (so a big CSV import doesn't bury your
 * reviewed posts), then newest created.
 */
export async function loadPostList(supabase: CurrentUser["supabase"], userId: string, page = 1) {
  const from = (Math.max(1, page) - 1) * POSTS_PER_PAGE;
  const [list, withResults] = await Promise.all([
    supabase
      .from("posts")
      .select(
        "id, hook, platform, format, goal, status, source, posted_at, created_at, root_post_id, reviews(total_score, predicted_tier, created_at), results(performance_index, created_at)",
        { count: "exact" },
      )
      .eq("user_id", userId)
      .order("posted_at", { ascending: false, nullsFirst: true })
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, from + POSTS_PER_PAGE - 1),
    supabase
      .from("posts")
      .select("id, results!inner(id)", { count: "exact", head: true })
      .eq("user_id", userId),
  ]);
  if (list.error) console.error("[posts] list failed:", list.error);
  const posts = (list.data ?? []).map(({ reviews, results, ...post }) => {
    const review = newestFirst(reviews)[0] ?? null;
    const result = newestFirst(results)[0] ?? null;
    return {
      ...post,
      score: review ? Number(review.total_score) : null,
      predictedTier: review?.predicted_tier ?? null,
      performanceIndex: result?.performance_index == null ? null : Number(result.performance_index),
    };
  });
  return { posts, total: list.count ?? posts.length, withResults: withResults.count ?? 0 };
}
