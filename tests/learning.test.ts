import { describe, expect, it, vi } from "vitest";
import type { ClaudeCaller, ClaudeReply } from "@/lib/claude";
import { SAMPLE_LEARNING_REPLY } from "@/lib/fixtures/sample-learning";
import { buildLearningMessage, parseLearningReply, runLearning, type LearningInput } from "@/lib/learning";
import { SCHEMA_VERSION } from "@/lib/schema";

const reply = (text: string): ClaudeReply => ({
  content: [{ type: "text", text, citations: null }],
  stop_reason: "end_turn",
  stop_details: null,
  model: "claude-sonnet-5-5",
  usage: { input_tokens: 100, output_tokens: 50 } as ClaudeReply["usage"],
});

const json = (value: unknown) => "Analysis.\n```json\n" + JSON.stringify(value) + "\n```";

describe("parseLearningReply", () => {
  it("parses the sample reply", () => {
    const r = parseLearningReply(SAMPLE_LEARNING_REPLY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.lesson).toMatch(/cap the predicted tier at AVERAGE/);
    expect(r.value.weigh_differently).toEqual([
      expect.objectContaining({ category: "proof", direction: "more" }),
      expect.objectContaining({ category: "hook", direction: "less" }),
    ]);
  });

  it("normalises categories and directions, and tolerates loose lists", () => {
    const r = parseLearningReply(
      json({
        gap_summary: "Gap",
        lesson: "Lesson",
        what_was_right: "One thing",
        what_was_missed: null,
        weigh_differently: [
          { category: "Offer Fit", direction: "Lower", why: "x" },
          { category: "pacing", direction: "up", why: 3 },
        ],
      }),
    );
    expect(r).toEqual({
      ok: true,
      value: {
        gap_summary: "Gap",
        lesson: "Lesson",
        what_was_right: ["One thing"],
        what_was_missed: [],
        weigh_differently: [
          { category: "offer_fit", direction: "less", why: "x" },
          { category: "other", direction: "more", why: "3" },
        ],
      },
    });
  });

  it("explains what's missing", () => {
    expect(parseLearningReply(json({ gap_summary: "Gap" }))).toEqual({ ok: false, problem: expect.stringMatching(/lesson/) });
    expect(parseLearningReply("No JSON here")).toEqual({ ok: false, problem: expect.stringMatching(/No JSON/) });
    expect(parseLearningReply("```json\n{ nope\n```")).toEqual({ ok: false, problem: expect.stringMatching(/not valid JSON/) });
  });
});

const baseInput: LearningInput = {
  post: { platform: "instagram", format: "reel", goal: "leads", hook: "I made $3k", script: "Script", on_screen_text: "" },
  review: { total_score: 61, predicted_tier: "ABOVE", confidence: "LOW", predicted_outcome: "LEADS", view: null },
  result: { views: 4000, dms: 2, performance_index: 0.45, collected_at: "2026-09-20T12:00:00Z" },
  averages: { avg_views: 5000, avg_dms: 8 },
};

describe("buildLearningMessage", () => {
  it("lays out prediction vs reality", () => {
    const text = buildLearningMessage(baseInput);
    expect(text).toContain("Platform: Instagram · Format: Reel · Goal: Leads");
    expect(text).toContain("Total score: 61/100 · Tier: ABOVE · Confidence: LOW · Most likely outcome: LEADS");
    expect(text).toContain("Scorecard: not available");
    expect(text).toContain("Actual: Views / reach: 4,000, DMs: 2");
    expect(text).toContain("Creator's averages on Instagram: Views / reach: 5,000, DMs: 8");
    expect(text).toContain("Performance Index: 0.45 (Below average) → actual tier BELOW");
  });

  it("copes with no averages and no PI", () => {
    const text = buildLearningMessage({ ...baseInput, averages: null, result: { ...baseInput.result, performance_index: null } });
    expect(text).toContain("averages on Instagram: not set");
    expect(text).toContain("Performance Index: not enough data");
  });
});

/** Minimal Supabase stand-in for runLearning: one note row, one averages row, records updates. */
function fakeSupabase(note: Record<string, unknown> | null) {
  const updates: Record<string, unknown>[] = [];
  const from = (table: string) => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({
        data: table === "calibration_notes" ? note : { platform: "instagram", avg_views: "5000", avg_dms: 8 },
        error: null,
      }),
      update: (values: Record<string, unknown>) => ({
        eq: async () => {
          updates.push(values);
          return { error: null };
        },
      }),
    };
    return query;
  };
  return { client: { from } as unknown as Parameters<typeof runLearning>[0], updates };
}

const noteRow = {
  id: "note-1",
  posts: baseInput.post,
  reviews: { total_score: "61", predicted_tier: "ABOVE", confidence: "LOW", predicted_outcome: "LEADS", parsed: {}, schema_version: SCHEMA_VERSION + 99 },
  results: { views: "4000", dms: 2, likes: null, performance_index: "0.45", collected_at: "2026-09-20T12:00:00Z" },
};

describe("runLearning", () => {
  it("saves the lesson and marks the note done", async () => {
    const { client, updates } = fakeSupabase(noteRow);
    const call = vi.fn<ClaudeCaller>().mockResolvedValue(reply(SAMPLE_LEARNING_REPLY));
    await runLearning(client, "note-1", { call });

    expect(call).toHaveBeenCalledTimes(1);
    const sent = call.mock.calls[0][0];
    expect(sent.system).toMatch(/calibration/i); // prompts/learning-mode.md
    expect(String(sent.messages[0].content)).toContain("Performance Index: 0.45");
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      status: "done",
      error: null,
      model: "claude-sonnet-5-5",
      lesson: expect.stringMatching(/cap the predicted tier/),
      details: { what_was_right: expect.any(Array), what_was_missed: expect.any(Array), weigh_differently: expect.any(Array) },
    });
  });

  it("marks the note as an error with a friendly message when Claude fails (never throws)", async () => {
    const { client, updates } = fakeSupabase(noteRow);
    const call = vi.fn<ClaudeCaller>().mockRejectedValue(new Error("boom"));
    await expect(runLearning(client, "note-1", { call })).resolves.toBeUndefined();
    expect(updates).toEqual([expect.objectContaining({ status: "error", error: expect.any(String) })]);
  });

  it("marks the note as an error when the reply never has valid JSON", async () => {
    const { client, updates } = fakeSupabase(noteRow);
    const call = vi.fn<ClaudeCaller>().mockResolvedValue(reply("Just prose."));
    await runLearning(client, "note-1", { call });
    expect(call).toHaveBeenCalledTimes(2); // one JSON-only retry
    expect(updates).toEqual([expect.objectContaining({ status: "error" })]);
  });

  it("doesn't call Claude when the review or result is gone", async () => {
    const { client, updates } = fakeSupabase({ ...noteRow, results: null });
    const call = vi.fn<ClaudeCaller>();
    await runLearning(client, "note-1", { call });
    expect(call).not.toHaveBeenCalled();
    expect(updates).toEqual([expect.objectContaining({ status: "error", error: expect.stringMatching(/missing/) })]);
  });
});
