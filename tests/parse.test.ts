import { describe, expect, it } from "vitest";
import { SAMPLE_REVIEW_REPLY } from "@/lib/fixtures/sample-review";
import { extractJsonText, parseReviewReply, stripJsonBlock } from "@/lib/parse";

const sampleJson = () => JSON.parse(extractJsonText(SAMPLE_REVIEW_REPLY)!);
const fence = (obj: unknown) => "Some analysis first.\n\n```json\n" + JSON.stringify(obj, null, 2) + "\n```\n";

describe("extractJsonText", () => {
  it("takes the LAST fenced json block", () => {
    const reply = 'Example: ```json\n{"a": 1}\n```\nFinal:\n```json\n{"b": 2}\n```';
    expect(JSON.parse(extractJsonText(reply)!)).toEqual({ b: 2 });
  });

  it("accepts an unlabelled fence", () => {
    expect(JSON.parse(extractJsonText('Here:\n```\n{"c": 3}\n```')!)).toEqual({ c: 3 });
  });

  it("falls back to the last balanced object when there is no fence", () => {
    const reply = 'Analysis with {braces} early. Final: {"d": {"e": "has } inside"}}';
    expect(JSON.parse(extractJsonText(reply)!)).toEqual({ d: { e: "has } inside" } });
  });

  it("returns null when there is no JSON at all", () => {
    expect(extractJsonText("Just prose, no JSON.")).toBeNull();
  });
});

describe("parseReviewReply", () => {
  it("parses the sample reply into the UI shape", () => {
    const result = parseReviewReply(SAMPLE_REVIEW_REPLY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const r = result.review;
    expect(r.personas).toHaveLength(5);
    expect(r.personas[2]).toMatchObject({ name: "The Ready Buyer", action: "dm", stopped: true, wouldFinish: true });
    expect(r.scores.hook).toEqual({ score: 7, evidence: '"$4,200 in 30 days with 10 minutes a day"' });
    expect(r.prediction).toMatchObject({ tier: "ABOVE", confidence: "LOW", outcome: "SAVES_SHARES" });
    expect(r.alternativeHooks).toHaveLength(5);
    expect(r.conversionChain.find((s) => s.status === "break")?.step).toBe(r.breakPoint);
    expect(r.rewrittenSection?.rewrite).toContain("Day 1");
    expect(r.improvedCta).toContain("Comment PLAN");
    expect(r.firstImpression.stopsScroll).toBe(true);
  });

  it("fails when there is no JSON block", () => {
    const result = parseReviewReply("Great post! 8/10.");
    expect(result).toEqual({ ok: false, problem: "No JSON block was found at the end of the reply." });
  });

  it("fails on truncated JSON (reply cut off mid-block)", () => {
    const cut = SAMPLE_REVIEW_REPLY.slice(0, SAMPLE_REVIEW_REPLY.indexOf('"alternative_hooks"'));
    const result = parseReviewReply(cut);
    expect(result.ok).toBe(false);
  });

  it("fails with a readable problem when a required field is missing", () => {
    const data = sampleJson();
    delete data.scores.story;
    delete data.prediction.tier;
    const result = parseReviewReply(fence(data));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem).toContain("scores.story");
    expect(result.problem).toContain("prediction.tier");
  });

  it("rejects an unknown tier and a non-numeric score", () => {
    const data = sampleJson();
    data.prediction.tier = "MEGA";
    data.scores.hook.score = "great";
    const result = parseReviewReply(fence(data));
    expect(result.ok).toBe(false);
  });

  it("requires at least one persona and one alternative hook", () => {
    const data = sampleJson();
    data.personas = [];
    data.alternative_hooks = ["", "  "];
    const result = parseReviewReply(fence(data));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem).toContain("personas");
    expect(result.problem).toContain("alternative_hooks");
  });
});

describe("stripJsonBlock", () => {
  it("returns only the prose before the JSON", () => {
    const prose = stripJsonBlock(SAMPLE_REVIEW_REPLY);
    expect(prose).toContain("## Audience panel");
    expect(prose).not.toContain('"first_impression"');
  });
});
