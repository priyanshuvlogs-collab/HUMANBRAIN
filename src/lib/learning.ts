/**
 * LEARNING MODE: after real results are saved, Claude compares the original review
 * with what actually happened and writes a calibration note. The 5 newest notes are
 * fed back into future reviews ({{CALIBRATION_NOTES}}).
 */
import "server-only";
import * as z from "zod";
import type { CurrentUser } from "./auth";
import { loadPromptFile } from "./brain";
import { ReviewError, runWithJsonRetry, type ClaudeCaller } from "./claude";
import type { CalibrationNoteSummary } from "./context";
import { GOALS, SCORE_CATEGORIES, SCORE_LABELS, formatLabel, platformLabel, type Goal } from "./constants";
import { SAMPLE_LEARNING_REPLY } from "./fixtures/sample-learning";
import { describeMetrics, formatDate, truncate } from "./format";
import { jsonCandidates } from "./parse";
import { METRIC_KEYS, describePerformanceIndex, tierForPerformanceIndex, type Metrics } from "./performance";
import { SCHEMA_VERSION, describeIssues, normalizeEnumValue, type ReviewView } from "./schema";

// ---- the JSON block learning mode returns --------------------------------------

const text = z.preprocess((v) => (v == null ? "" : typeof v === "string" ? v.trim() : String(v)), z.string());
const textList = z
  .preprocess((v) => (typeof v === "string" ? [v] : v), z.array(text))
  .transform((items) => items.filter(Boolean))
  .catch([]);

const CATEGORIES = [...SCORE_CATEGORIES, "other"] as const;

export const learningSchema = z.object({
  gap_summary: text.pipe(z.string().min(1, "gap_summary is required")),
  what_was_right: textList,
  what_was_missed: textList,
  weigh_differently: z
    .array(
      z.object({
        category: z
          .preprocess((v) => {
            const n = normalizeEnumValue(v);
            return typeof n === "string" ? n.toLowerCase() : n;
          }, z.enum(CATEGORIES))
          .catch("other"),
        direction: z
          .preprocess((v) => (typeof v === "string" && /less|lower|down|over/i.test(v) ? "less" : "more"), z.enum(["more", "less"]))
          .catch("more"),
        why: text,
      }),
    )
    .catch([]),
  lesson: text.pipe(z.string().min(1, "lesson is required")),
});
export type LearningOutput = z.infer<typeof learningSchema>;

export function parseLearningReply(reply: string): { ok: true; value: LearningOutput } | { ok: false; problem: string } {
  const candidates = jsonCandidates(reply);
  if (candidates.length === 0) return { ok: false, problem: "No JSON block was found at the end of the reply." };
  for (const candidate of candidates) {
    let data: unknown;
    try {
      data = JSON.parse(candidate);
    } catch {
      continue;
    }
    const result = learningSchema.safeParse(data);
    return result.success ? { ok: true, value: result.data } : { ok: false, problem: describeIssues(result.error) };
  }
  return { ok: false, problem: "The JSON block is not valid JSON." };
}

// ---- the message sent to Claude --------------------------------------------------

export type LearningInput = {
  post: { platform: string; format: string; goal: string; hook: string; script: string; on_screen_text: string };
  review: {
    total_score: number;
    predicted_tier: string;
    confidence: string;
    predicted_outcome: string | null;
    view: ReviewView | null; // null if saved in an older format
  };
  result: Metrics & { performance_index: number | null; collected_at: string };
  averages: Record<string, number | null> | null;
};

export function buildLearningMessage({ post, review, result, averages }: LearningInput): string {
  const goal = GOALS[post.goal as Goal] ?? post.goal;
  const scores = review.view
    ? SCORE_CATEGORIES.map((c) => `${SCORE_LABELS[c]} ${review.view!.scores[c].score}/10`).join(", ")
    : "not available";
  const pi = result.performance_index;
  const actualTier = tierForPerformanceIndex(pi);
  const metrics: Metrics = Object.fromEntries(METRIC_KEYS.map((k) => [k, result[k] ?? null]));
  const avgMetrics: Metrics = averages
    ? Object.fromEntries(METRIC_KEYS.map((k) => [k, averages[k === "avg_watch_pct" ? k : `avg_${k}`] ?? null]))
    : {};

  return [
    "POST",
    `Platform: ${platformLabel(post.platform)} · Format: ${formatLabel(post.platform, post.format)} · Goal: ${goal}`,
    `Hook: ${post.hook}`,
    `Script/caption: ${truncate(post.script || "(none)", 1500)}`,
    `On-screen text: ${truncate(post.on_screen_text || "(none)", 400)}`,
    "",
    "PREDICTION (made before posting)",
    `Total score: ${review.total_score}/100 · Tier: ${review.predicted_tier} · Confidence: ${review.confidence}` +
      (review.predicted_outcome ? ` · Most likely outcome: ${review.predicted_outcome}` : ""),
    `Scorecard: ${scores}`,
    `Break point: ${review.view?.breakPoint ?? "none"}`,
    `Prediction summary: ${review.view?.prediction.summary || "(none)"}`,
    "",
    `REAL RESULTS (collected ${formatDate(result.collected_at)})`,
    `Actual: ${describeMetrics(metrics)}`,
    `Creator's averages on ${platformLabel(post.platform)}: ${averages ? describeMetrics(avgMetrics) : "not set"}`,
    `Performance Index: ${pi ?? "not enough data"}${pi != null ? ` (${describePerformanceIndex(pi)}) → actual tier ${actualTier}` : ""}`,
  ].join("\n");
}

// ---- running it --------------------------------------------------------------------

/**
 * Runs learning mode for one pending calibration note and saves the outcome
 * (status done or error). Never throws — it runs in the background via after().
 */
export async function runLearning(
  supabase: CurrentUser["supabase"],
  noteId: string,
  options: { call?: ClaudeCaller } = {},
): Promise<void> {
  const fail = async (message: string) => {
    await supabase
      .from("calibration_notes")
      .update({ status: "error", error: message, updated_at: new Date().toISOString() })
      .eq("id", noteId);
  };

  try {
    const { data: note, error } = await supabase
      .from("calibration_notes")
      .select(
        "id, posts(platform, format, goal, hook, script, on_screen_text), reviews(total_score, predicted_tier, confidence, predicted_outcome, parsed, schema_version), results(*)",
      )
      .eq("id", noteId)
      .maybeSingle();
    if (error || !note) throw new ReviewError("The note to analyse wasn't found.", 404);
    if (!note.posts || !note.reviews || !note.results) {
      return await fail("The original review or results are missing, so there's nothing to compare.");
    }

    const { data: averages } = await supabase
      .from("platform_averages")
      .select("*")
      .eq("platform", note.posts.platform)
      .maybeSingle();

    const r = note.reviews;
    const input: LearningInput = {
      post: note.posts,
      review: {
        total_score: Number(r.total_score),
        predicted_tier: r.predicted_tier,
        confidence: r.confidence,
        predicted_outcome: r.predicted_outcome,
        view: r.schema_version === SCHEMA_VERSION ? (r.parsed as unknown as ReviewView) : null,
      },
      result: {
        ...Object.fromEntries(METRIC_KEYS.map((k) => [k, note.results![k] == null ? null : Number(note.results![k])])),
        performance_index: note.results.performance_index == null ? null : Number(note.results.performance_index),
        collected_at: note.results.collected_at,
      },
      averages: averages
        ? Object.fromEntries(Object.entries(averages).map(([k, v]) => [k, typeof v === "number" ? v : v == null ? null : Number(v)]))
        : null,
    };

    const system = await loadPromptFile("learning-mode.md");
    const run = await runWithJsonRetry<LearningOutput>({
      system,
      userMessage: buildLearningMessage(input),
      parse: parseLearningReply,
      task: "analyse these results",
      mockReply: SAMPLE_LEARNING_REPLY,
      call: options.call,
    });

    const { error: saveError } = await supabase
      .from("calibration_notes")
      .update({
        status: "done",
        gap_summary: run.value.gap_summary,
        lesson: run.value.lesson,
        details: {
          what_was_right: run.value.what_was_right,
          what_was_missed: run.value.what_was_missed,
          weigh_differently: run.value.weigh_differently,
        },
        error: null,
        model: run.model,
        updated_at: new Date().toISOString(),
      })
      .eq("id", noteId);
    if (saveError) {
      console.error("[learning] couldn't save the finished note:", saveError);
      await fail("The analysis finished but couldn't be saved. Try again.");
    }
  } catch (err) {
    const message = err instanceof ReviewError ? err.userMessage : "Learning mode failed unexpectedly. Try again.";
    if (!(err instanceof ReviewError)) console.error("[learning] unexpected error:", err);
    await fail(message).catch((e) => console.error("[learning] couldn't save error status:", e));
  }
}

/**
 * The newest finished learning notes, shaped for {{CALIBRATION_NOTES}}.
 * One note per post (its newest), so re-logging a post's results doesn't crowd out other lessons.
 */
export async function loadRecentLessons(
  supabase: CurrentUser["supabase"],
  userId: string,
  limit = 5,
): Promise<CalibrationNoteSummary[]> {
  const { data, error } = await supabase
    .from("calibration_notes")
    .select(
      "post_id, created_at, gap_summary, lesson, details, posts(platform, format, goal), reviews(total_score, predicted_tier), results(performance_index)",
    )
    .eq("user_id", userId)
    .eq("status", "done")
    .order("created_at", { ascending: false })
    .limit(limit * 4);
  if (error) {
    console.error("[learning] loading lessons failed:", error);
    return [];
  }
  const seen = new Set<string>();
  const newestPerPost = (data ?? []).filter((n) => !seen.has(n.post_id) && seen.add(n.post_id)).slice(0, limit);
  return newestPerPost.map((n) => {
    const details = (n.details ?? {}) as { weigh_differently?: { category: string; direction: string }[] };
    return {
      createdAt: n.created_at,
      platform: n.posts?.platform ?? "",
      format: n.posts?.format ?? "",
      goal: n.posts?.goal ?? "",
      predictedScore: n.reviews ? Number(n.reviews.total_score) : null,
      predictedTier: n.reviews?.predicted_tier ?? null,
      performanceIndex: n.results?.performance_index == null ? null : Number(n.results.performance_index),
      gapSummary: n.gap_summary,
      lesson: n.lesson,
      weighDifferently: Array.isArray(details.weigh_differently) ? details.weigh_differently : [],
    };
  });
}
