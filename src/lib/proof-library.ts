/**
 * PROOF LIBRARY: your 5 best and 5 worst past posts on the same platform, with real
 * metrics, injected into every review as {{PROOF_LIBRARY}}.
 *
 * Selection is by Performance Index today. To upgrade to "most similar posts" later
 * (pgvector), replace `loadProofCandidates` with a similarity query; the formatter and
 * the review route stay the same.
 */
import "server-only";
import type { CurrentUser } from "./auth";
import { METRIC_KEYS, type Metrics } from "./performance";

export type ProofCandidate = {
  postId: string;
  rootId: string;
  format: string;
  goal: string;
  hook: string;
  script: string;
  performanceIndex: number;
  metrics: Metrics;
};

export type ProofSelection = { best: ProofCandidate[]; worst: ProofCandidate[] };

export const PROOF_COUNT = 5;

/**
 * Picks the best and worst posts, skipping the post being reviewed and its other versions
 * (re-reviews share a root). With fewer than 10 posts, best and worst never overlap.
 */
export function selectProofExamples(
  candidates: ProofCandidate[],
  options: { excludeRootId?: string | null; count?: number } = {},
): ProofSelection {
  const count = options.count ?? PROOF_COUNT;
  const pool = candidates
    .filter((c) => !options.excludeRootId || c.rootId !== options.excludeRootId)
    .sort((a, b) => b.performanceIndex - a.performanceIndex);
  const bestCount = Math.min(count, Math.ceil(pool.length / 2));
  const best = pool.slice(0, bestCount);
  const worstCount = Math.min(count, pool.length - bestCount);
  const worst = pool.slice(pool.length - worstCount).reverse();
  return { best, worst };
}

type Supabase = CurrentUser["supabase"];

/** Posts on this platform whose newest result has a Performance Index. */
export async function loadProofCandidates(supabase: Supabase, userId: string, platform: string): Promise<ProofCandidate[]> {
  const { data, error } = await supabase
    .from("posts")
    .select(
      "id, root_post_id, format, goal, hook, script, results(views, hold_3s_pct, avg_watch_pct, likes, comments, saves, shares, dms, link_clicks, leads, sales, performance_index, collected_at, created_at)",
    )
    .eq("user_id", userId)
    .eq("platform", platform)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    console.error("[proof-library] load failed:", error);
    return [];
  }
  return (data ?? []).flatMap((post) => {
    const latest = [...post.results].sort(
      (a, b) => b.collected_at.localeCompare(a.collected_at) || b.created_at.localeCompare(a.created_at),
    )[0];
    if (!latest || latest.performance_index == null) return [];
    const metrics: Metrics = Object.fromEntries(
      METRIC_KEYS.map((k) => [k, latest[k] == null ? null : Number(latest[k])]),
    );
    return [
      {
        postId: post.id,
        rootId: post.root_post_id ?? post.id,
        format: post.format,
        goal: post.goal,
        hook: post.hook,
        script: post.script,
        performanceIndex: Number(latest.performance_index),
        metrics,
      },
    ];
  });
}

export async function getProofExamples(
  supabase: Supabase,
  userId: string,
  options: { platform: string; excludeRootId?: string | null },
): Promise<ProofSelection> {
  const candidates = await loadProofCandidates(supabase, userId, options.platform);
  return selectProofExamples(candidates, { excludeRootId: options.excludeRootId });
}
