import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { MIN_RETRY_MS, ReviewError, runReview, toReviewError, type ClaudeCaller, type ClaudeReply } from "@/lib/claude";
import { SAMPLE_REVIEW_REPLY } from "@/lib/fixtures/sample-review";

const reply = (text: string, extra: Partial<ClaudeReply> = {}): ClaudeReply => ({
  content: text ? [{ type: "text", text, citations: null }] : [],
  stop_reason: "end_turn",
  stop_details: null,
  model: "claude-sonnet-5-5",
  usage: { input_tokens: 100, output_tokens: 50 } as ClaudeReply["usage"],
  ...extra,
});

const JSON_ONLY = SAMPLE_REVIEW_REPLY.slice(SAMPLE_REVIEW_REPLY.indexOf("```json"));
const input = { system: "SYSTEM", userMessage: "POST" };

describe("runReview", () => {
  it("returns the parsed review on the first try", async () => {
    const call = vi.fn<ClaudeCaller>().mockResolvedValue(reply(SAMPLE_REVIEW_REPLY));
    const result = await runReview({ ...input, call });
    expect(call).toHaveBeenCalledTimes(1);
    expect(result.retried).toBe(false);
    expect(result.review.prediction.tier).toBe("ABOVE");
    expect(result.usage).toMatchObject({ calls: 1, input_tokens: 100, output_tokens: 50 });
  });

  it("retries once with a 3-turn conversation when the JSON is invalid", async () => {
    const call = vi
      .fn<ClaudeCaller>()
      .mockResolvedValueOnce(reply("Prose analysis.\n```json\n{ broken json\n```"))
      .mockResolvedValueOnce(reply(JSON_ONLY));
    const result = await runReview({ ...input, call });
    expect(call).toHaveBeenCalledTimes(2);
    const retryMessages = call.mock.calls[1][0].messages;
    expect(retryMessages).toHaveLength(3);
    expect(retryMessages[1]).toMatchObject({ role: "assistant" });
    expect(String(retryMessages[2].content)).toMatch(/ONLY the corrected/);
    expect(result.retried).toBe(true);
    expect(result.rawResponse.startsWith("Prose analysis.")).toBe(true);
    expect(result.usage.calls).toBe(2);
  });

  it("re-sends the original question when the first reply had no text", async () => {
    const call = vi
      .fn<ClaudeCaller>()
      .mockResolvedValueOnce(reply("", { stop_reason: "max_tokens" }))
      .mockResolvedValueOnce(reply(SAMPLE_REVIEW_REPLY));
    await runReview({ ...input, call });
    expect(call.mock.calls[1][0].messages).toEqual([{ role: "user", content: "POST" }]);
  });

  it("gives up after one retry", async () => {
    const call = vi.fn<ClaudeCaller>().mockResolvedValue(reply("still no json"));
    await expect(runReview({ ...input, call })).rejects.toThrow(/even after a retry/);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("does not retry a refusal and explains it", async () => {
    const call = vi.fn<ClaudeCaller>().mockResolvedValue(
      reply("", {
        stop_reason: "refusal",
        stop_details: { type: "refusal", category: "general_harms", explanation: null } as ClaudeReply["stop_details"],
      }),
    );
    const err = await runReview({ ...input, call }).catch((e) => e);
    expect(err).toBeInstanceOf(ReviewError);
    expect(err.userMessage).toMatch(/declined.*general harms/);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("skips the retry when the time budget is nearly used up", async () => {
    let t = 0;
    const call = vi.fn<ClaudeCaller>().mockImplementation(async () => {
      t += 250_000; // first call took 250s of a 270s budget
      return reply("no json here");
    });
    await expect(runReview({ ...input, call, now: () => t, budgetMs: 270_000 })).rejects.toThrow(/wasn't time to retry/);
    expect(call).toHaveBeenCalledTimes(1);
    expect(270_000 - 250_000).toBeLessThan(MIN_RETRY_MS);
  });

  it("passes an abort signal so a slow call is stopped", async () => {
    const call = vi.fn<ClaudeCaller>().mockResolvedValue(reply(SAMPLE_REVIEW_REPLY));
    await runReview({ ...input, call });
    expect(call.mock.calls[0][0].signal).toBeInstanceOf(AbortSignal);
  });
});

describe("toReviewError", () => {
  const apiError = (status: number | undefined, type?: string, message = "x") =>
    Anthropic.APIError.generate(status as number, { type: "error", error: { type, message } }, message, new Headers());

  it.each([
    [new Anthropic.APIUserAbortError(), /took too long/],
    [new Anthropic.APIConnectionTimeoutError(), /took too long/],
    [new Anthropic.APIConnectionError({ message: "down" }), /network/],
    [apiError(401, "authentication_error"), /API key is invalid/],
    [apiError(402, "billing_error"), /credit/],
    [apiError(400, "invalid_request_error", "Your credit balance is too low"), /credit/],
    [apiError(404, "not_found_error"), /CLAUDE_MODEL/],
    [apiError(429, "rate_limit_error"), /busy/],
    [apiError(529, "overloaded_error"), /overloaded/],
    [new Anthropic.APIError(undefined, { type: "overloaded_error" }, undefined, new Headers(), "overloaded_error"), /overloaded/],
    [apiError(500, "api_error"), /their side/],
    [new Error("boom"), /Something went wrong/],
  ])("maps %s", (err, pattern) => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(toReviewError(err).userMessage).toMatch(pattern);
    spy.mockRestore();
  });
});
