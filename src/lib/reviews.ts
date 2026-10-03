import "server-only";
import type { CurrentUser } from "./auth";
import { SCHEMA_VERSION, type ReviewView } from "./schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Loads one review with its post (RLS: only the signed-in user's). Null if not found. */
export async function loadReview(supabase: CurrentUser["supabase"], reviewId: string) {
  if (!UUID.test(reviewId)) return null;
  const { data, error } = await supabase
    .from("reviews")
    .select("*, posts(*, offers(name))")
    .eq("id", reviewId)
    .maybeSingle();
  if (error) console.error("[reviews] load failed:", error);
  if (!data || !data.posts) return null;

  const { posts: post, ...review } = data;
  // Reviews saved with an older schema can't be shown in the new layout (full text only).
  const view = review.schema_version === SCHEMA_VERSION ? (review.parsed as unknown as ReviewView) : null;
  return { review, post, offerName: post.offers?.name ?? null, view };
}

export type LoadedReview = NonNullable<Awaited<ReturnType<typeof loadReview>>>;

/** All versions (original + re-reviews) of a post, each with its latest review id and score. */
export async function loadVersions(supabase: CurrentUser["supabase"], post: { id: string; root_post_id: string | null }) {
  const rootId = post.root_post_id ?? post.id;
  const { data } = await supabase
    .from("posts")
    .select("id, hook, created_at, reviews(id, total_score, created_at)")
    .or(`id.eq.${rootId},root_post_id.eq.${rootId}`)
    .order("created_at");
  return (data ?? [])
    .map((p) => {
      const latest = [...p.reviews].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      return latest ? { postId: p.id, hook: p.hook, reviewId: latest.id, totalScore: Number(latest.total_score) } : null;
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);
}
