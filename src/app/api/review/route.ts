import { NextResponse } from "next/server";
import * as z from "zod";
import { getCurrentUser } from "@/lib/auth";
import { buildSystemPrompt, loadBrainFiles } from "@/lib/brain";
import { ReviewError, runReview } from "@/lib/claude";
import { GOAL_KEYS, MAX_ACTIVE_PERSONAS, PLATFORM_KEYS, SCORE_CATEGORIES, isValidFormat } from "@/lib/constants";
import { buildPlaceholderValues, postMessage, type PostInput } from "@/lib/context";
import { SCHEMA_VERSION } from "@/lib/schema";
import { computeTotalScore } from "@/lib/scoring";

// A review can take 20–60s (more with a retry). Vercel Hobby allows up to 300s.
export const maxDuration = 300;

const hookField = z.string().trim().min(1, "Please write a hook.").max(500, "The hook is too long (max 500 characters).");

const newReviewBody = z
  .object({
    platform: z.enum(PLATFORM_KEYS, { error: "Pick a platform." }),
    format: z.string(),
    goal: z.enum(GOAL_KEYS, { error: "Pick a goal." }),
    offerId: z.uuid().nullable().optional(),
    hook: hookField,
    script: z.string().max(10_000, "The script is too long (max 10,000 characters).").default(""),
    onScreenText: z.string().max(2_000, "On-screen text is too long (max 2,000 characters).").default(""),
  })
  .refine((b) => isValidFormat(b.platform, b.format), { message: "Pick a format for this platform.", path: ["format"] });

const reReviewBody = z.object({ fromPostId: z.uuid(), hook: hookField });

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return fail("You're signed out. Please log in again.", 401);
  const { supabase, userId } = user;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("Invalid request.", 400);
  }

  // ---- 1. Work out which post we're reviewing -----------------------------------
  let post: PostInput & { offerId: string | null };
  let rootPostId: string | null = null;

  if (body && typeof body === "object" && "fromPostId" in body) {
    const parsed = reReviewBody.safeParse(body);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid request.", 400);
    const { data: source } = await supabase.from("posts").select("*").eq("id", parsed.data.fromPostId).maybeSingle();
    if (!source) return fail("The original post wasn't found.", 404);
    post = {
      platform: source.platform,
      format: source.format,
      goal: source.goal,
      hook: parsed.data.hook,
      script: source.script,
      onScreenText: source.on_screen_text,
      offerId: source.offer_id,
    };
    rootPostId = source.root_post_id ?? source.id;
  } else {
    const parsed = newReviewBody.safeParse(body);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid request.", 400);
    post = { ...parsed.data, offerId: parsed.data.offerId ?? null };
  }

  // ---- 2. Load everything the brain needs (all through RLS = only this user's rows) ----
  const offerQuery = post.offerId
    ? supabase.from("offers").select("name, price, cta_type, cta_destination").eq("id", post.offerId).maybeSingle()
    : Promise.resolve({ data: null, error: null });
  const [offerRes, brandRes, averagesRes, personasRes] = await Promise.all([
    offerQuery,
    supabase.from("brand_settings").select("handle, niche, platforms").eq("user_id", userId).maybeSingle(),
    supabase
      .from("platform_averages")
      .select("platform, avg_views, avg_hold_3s_pct, avg_watch_pct, avg_saves, avg_shares, avg_dms")
      .eq("user_id", userId)
      .eq("platform", post.platform)
      .maybeSingle(),
    supabase
      .from("personas")
      .select("name, description, voice")
      .eq("user_id", userId)
      .eq("active", true)
      .order("sort_order")
      .order("created_at")
      .limit(MAX_ACTIVE_PERSONAS),
  ]);
  const loadError = offerRes.error ?? brandRes.error ?? averagesRes.error ?? personasRes.error;
  if (loadError) {
    console.error("[review] loading context failed:", loadError);
    return fail("Couldn't load your settings. Please try again.", 500);
  }
  if (post.offerId && !offerRes.data) return fail("That offer wasn't found. Pick another one.", 400);

  // ---- 3. Build the system prompt from the brain file ---------------------------
  let system: ReturnType<typeof buildSystemPrompt>;
  try {
    const files = await loadBrainFiles();
    system = buildSystemPrompt(
      files,
      buildPlaceholderValues({
        platform: post.platform,
        brand: brandRes.data,
        offer: offerRes.data,
        averages: averagesRes.data,
        personas: personasRes.data ?? [],
      }),
    );
  } catch (err) {
    console.error("[review] brain file problem:", err);
    return fail("The brain file (prompts/offer-brain-system.md) couldn't be loaded.", 500);
  }

  // ---- 4. Ask Claude (with one JSON retry inside runReview) ---------------------
  // Deliberately NOT tied to request.signal: if a phone backgrounds the tab, the paid
  // review still finishes and is saved under Recent reviews.
  let result: Awaited<ReturnType<typeof runReview>>;
  try {
    result = await runReview({ system: system.prompt, userMessage: postMessage(post, offerRes.data?.name ?? null) });
  } catch (err) {
    const e = err instanceof ReviewError ? err : new ReviewError("Something went wrong. Please try again.", 500);
    return fail(e.userMessage, e.status);
  }

  // ---- 5. Save: post first, then the review (only now that we have a valid review) ----
  const { data: savedPost, error: postError } = await supabase
    .from("posts")
    .insert({
      user_id: userId,
      platform: post.platform,
      format: post.format,
      goal: post.goal,
      hook: post.hook,
      script: post.script,
      on_screen_text: post.onScreenText,
      offer_id: post.offerId,
      root_post_id: rootPostId,
    })
    .select("id")
    .single();
  if (postError || !savedPost) {
    console.error("[review] saving post failed:", postError, "\nraw response:", result.rawResponse);
    return fail("The review finished but couldn't be saved. Please try again.", 500);
  }

  const scores = Object.fromEntries(SCORE_CATEGORIES.map((c) => [c, result.review.scores[c].score])) as Record<
    (typeof SCORE_CATEGORIES)[number],
    number
  >;
  const { data: savedReview, error: reviewError } = await supabase
    .from("reviews")
    .insert({
      user_id: userId,
      post_id: savedPost.id,
      raw_response: result.rawResponse,
      parsed: result.review,
      schema_version: SCHEMA_VERSION,
      provisional_format: system.provisional,
      total_score: computeTotalScore(scores),
      predicted_tier: result.review.prediction.tier,
      confidence: result.review.prediction.confidence,
      predicted_outcome: result.review.prediction.outcome,
      model: result.model,
      brain_version: system.version,
      usage: { ...result.usage, retried: result.retried },
    })
    .select("id")
    .single();
  if (reviewError || !savedReview) {
    console.error("[review] saving review failed:", reviewError, "\nraw response:", result.rawResponse);
    await supabase.from("posts").delete().eq("id", savedPost.id);
    return fail("The review finished but couldn't be saved. Please try again.", 500);
  }

  return NextResponse.json({ reviewId: savedReview.id, postId: savedPost.id });
}
