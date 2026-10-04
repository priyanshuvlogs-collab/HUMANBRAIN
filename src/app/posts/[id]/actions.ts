"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import * as z from "zod";
import type { ActionState } from "@/lib/action-state";
import { getCurrentUser } from "@/lib/auth";
import type { Goal } from "@/lib/constants";
import { parseDateInput } from "@/lib/dates";
import { runLearning } from "@/lib/learning";
import { computePerformanceIndex, describePerformanceIndex, METRIC_KEYS } from "@/lib/performance";
import { STALE_PENDING_MS } from "@/lib/posts";
import { hasAnyMetric, metricsSchema, optionalNumber, toNumberRecord } from "@/lib/results";

const SIGNED_OUT: ActionState = { error: "You're signed out. Please log in again." };
const NOT_FOUND: ActionState = { error: "That post wasn't found. Refresh the page and try again." };

const idField = z.uuid();

function refresh(postId: string) {
  revalidatePath(`/posts/${postId}`);
  revalidatePath("/posts");
}

/** Mark a post as posted, with when / where (all optional). */
export async function savePostingDetails(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return SIGNED_OUT;
  const postId = idField.safeParse(formData.get("postId"));
  if (!postId.success) return NOT_FOUND;

  const postedAt = parseDateInput(formData.get("posted_at"), "Posted date");
  if (!postedAt.ok) return { error: postedAt.error };
  const details = z
    .object({
      external_post_id: z.string().trim().max(300, "The link or ID is too long."),
      video_length_sec: optionalNumber("Video length", 36_000).refine((n) => n == null || Number.isInteger(n), {
        error: "Video length: use whole seconds.",
      }),
    })
    .safeParse({
      external_post_id: formData.get("external_post_id") ?? "",
      video_length_sec: formData.get("video_length_sec") ?? "",
    });
  if (!details.success) return { error: details.error.issues[0].message };

  const { data, error } = await user.supabase
    .from("posts")
    .update({
      status: "posted",
      posted_at: postedAt.value,
      external_post_id: details.data.external_post_id || null,
      video_length_sec: details.data.video_length_sec || null,
    })
    .eq("id", postId.data)
    .select("id");
  if (error) {
    console.error("[posts] posting details save failed:", error);
    return { error: "Couldn't save. Please try again." };
  }
  if (!data?.length) return NOT_FOUND;
  refresh(postId.data);
  return { ok: "Saved." };
}

/**
 * Save real results: compute the Performance Index, store a results row, mark the post as
 * posted, and (if the post was reviewed) start learning mode in the background.
 */
export async function saveResults(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return SIGNED_OUT;
  const { supabase, userId } = user;
  const postId = idField.safeParse(formData.get("postId"));
  if (!postId.success) return NOT_FOUND;

  const metrics = metricsSchema.safeParse(Object.fromEntries(METRIC_KEYS.map((k) => [k, formData.get(k) ?? ""])));
  if (!metrics.success) return { error: metrics.error.issues[0].message };
  if (!hasAnyMetric(metrics.data)) return { error: "Enter at least one number (views, likes, DMs…)." };
  const collected = parseDateInput(formData.get("collected_at"), "Date collected");
  if (!collected.ok) return { error: collected.error };

  const { data: post } = await supabase
    .from("posts")
    .select("id, goal, platform, status, reviews(id, created_at)")
    .eq("id", postId.data)
    .maybeSingle();
  if (!post) return NOT_FOUND;

  const { data: averagesRow } = await supabase
    .from("platform_averages")
    .select("*")
    .eq("user_id", userId)
    .eq("platform", post.platform)
    .maybeSingle();
  const pi = computePerformanceIndex(post.goal as Goal, metrics.data, toNumberRecord(averagesRow));

  const { data: result, error } = await supabase
    .from("results")
    .insert({
      user_id: userId,
      post_id: post.id,
      ...metrics.data,
      performance_index: pi,
      collected_at: collected.value ?? new Date().toISOString(),
      source: "manual",
    })
    .select("id")
    .single();
  if (error || !result) {
    console.error("[posts] results save failed:", error);
    return { error: "Couldn't save your results. Please try again." };
  }

  if (post.status !== "posted") {
    const { error: statusError } = await supabase.from("posts").update({ status: "posted" }).eq("id", post.id);
    if (statusError) console.error("[posts] mark posted failed:", statusError);
  }

  let learning = false;
  const review = [...post.reviews].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (review) {
    const { data: note, error: noteError } = await supabase
      .from("calibration_notes")
      .insert({ user_id: userId, post_id: post.id, review_id: review.id, result_id: result.id, status: "pending" })
      .select("id")
      .single();
    if (noteError || !note) {
      console.error("[posts] couldn't create learning note:", noteError);
    } else {
      learning = true;
      after(() => runLearning(supabase, note.id));
    }
  }

  refresh(post.id);
  const piText =
    pi == null
      ? "No Performance Index yet: add your averages in Brand settings for the metrics this goal uses."
      : `Performance Index ${pi.toFixed(2)} (${describePerformanceIndex(pi).toLowerCase()}).`;
  return { ok: `Saved. ${piText}${learning ? " Learning mode is comparing it with the prediction…" : ""}` };
}

/** Re-run learning mode for a note that failed (or got stuck). */
export async function retryLearning(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return SIGNED_OUT;
  const noteId = idField.safeParse(formData.get("noteId"));
  if (!noteId.success) return NOT_FOUND;

  const staleBefore = new Date(Date.now() - STALE_PENDING_MS).toISOString();
  const { data, error } = await user.supabase
    .from("calibration_notes")
    .update({ status: "pending", error: null, updated_at: new Date().toISOString() })
    .eq("id", noteId.data)
    .or(`status.eq.error,and(status.eq.pending,updated_at.lt."${staleBefore}")`)
    .select("id, post_id");
  if (error) {
    console.error("[posts] retry learning failed:", error);
    return { error: "Couldn't restart learning mode. Please try again." };
  }
  const note = data?.[0];
  if (!note) return { error: "This note is already being analysed — give it a minute." };

  after(() => runLearning(user.supabase, note.id));
  refresh(note.post_id);
  return { ok: "Analysing again…" };
}
