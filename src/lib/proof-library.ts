/**
 * PROOF LIBRARY: your 5 best and 5 worst past posts on the same platform, with real
 * metrics, injected into every review as {{PROOF_LIBRARY}}.
 *
 * Selection is by Performance Index today (the top 5 and bottom 5 are fetched directly,
 * then de-duplicated). To upgrade to "most similar posts" later (pgvector), replace
 * `loadProofCandidates` with a similarity query; the formatter and the review route stay the same.
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
type LatestRow = Record<string, unknown> & {
  post_id: string | null;
  root_id: string | null;
  format: string | null;
  goal: string | null;
  hook: string | null;
  script: string | null;
  performance_index: number | null;
};

function toCandidate(row: LatestRow): ProofCandidate {
  return {
    postId: row.post_id ?? "",
    rootId: row.root_id ?? row.post_id ?? "",
    format: row.format ?? "",
    goal: row.goal ?? "",
    hook: row.hook ?? "",
    script: row.script ?? "",
    performanceIndex: Number(row.performance_index),
    metrics: Object.fromEntries(METRIC_KEYS.map((k) => [k, row[k] == null ? null : Number(row[k])])),
  };
}

/**
 * The highest and lowest Performance Index posts on this platform (each post's newest result,
 * from the latest_results view), so the whole history counts however many posts there are.
 */
export async function loadProofCandidates(
  supabase: Supabase,
  userId: string,
  platform: string,
  options: { excludeRootId?: string | null; count?: number } = {},
): Promise<ProofCandidate[]> {
  const count = options.count ?? PROOF_COUNT;
  const query = (ascending: boolean) => {
    let q = supabase
      .from("latest_results")
      .select(
        "post_id, root_id, format, goal, hook, script, performance_index, views, hold_3s_pct, avg_watch_pct, likes, comments, saves, shares, dms, link_clicks, leads, sales",
      )
      .eq("user_id", userId)
      .eq("platform", platform)
      .not("performance_index", "is", null);
    if (options.excludeRootId) q = q.neq("root_id", options.excludeRootId);
    return q.order("performance_index", { ascending }).order("post_id").limit(count);
  };
  const [top, bottom] = await Promise.all([query(false), query(true)]);
  if (top.error || bottom.error) {
    console.error("[proof-library] load failed:", top.error ?? bottom.error);
    return [];
  }
  const byPost = new Map<string, ProofCandidate>();
  for (const row of [...(top.data ?? []), ...(bottom.data ?? [])]) {
    if (row.post_id) byPost.set(row.post_id, toCandidate(row));
  }
  return [...byPost.values()];
}

export async function getProofExamples(
  supabase: Supabase,
  userId: string,
  options: { platform: string; excludeRootId?: string | null },
): Promise<ProofSelection> {
  const candidates = await loadProofCandidates(supabase, userId, options.platform, { excludeRootId: options.excludeRootId });
  return selectProofExamples(candidates, { excludeRootId: options.excludeRootId });
}
