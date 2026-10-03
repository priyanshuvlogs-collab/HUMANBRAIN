import { describe, expect, it } from "vitest";
import { extractJsonText } from "@/lib/parse";
import { SAMPLE_REVIEW_REPLY } from "@/lib/fixtures/sample-review";
import { normalizeEnumValue, reviewSchema } from "@/lib/schema";

const base = () => JSON.parse(extractJsonText(SAMPLE_REVIEW_REPLY)!);

describe("normalizeEnumValue", () => {
  it("normalises spacing, case and punctuation", () => {
    expect(normalizeEnumValue("Saves & Shares")).toBe("SAVES_SHARES");
    expect(normalizeEnumValue(" above ")).toBe("ABOVE");
    expect(normalizeEnumValue(7)).toBe(7);
  });
});

describe("reviewSchema leniency", () => {
  it("accepts enum variants via aliases", () => {
    const data = base();
    data.prediction.tier = "Above average";
    data.prediction.confidence = "med";
    data.prediction.outcome = "Saves/Shares";
    const r = reviewSchema.parse(data);
    expect(r.prediction).toMatchObject({ tier: "ABOVE", confidence: "MEDIUM", outcome: "SAVES_SHARES" });
  });

  it("an unknown outcome becomes null instead of failing", () => {
    const data = base();
    data.prediction.outcome = "FOLLOWERS";
    expect(reviewSchema.parse(data).prediction.outcome).toBeNull();
  });

  it("coerces and clamps scores; accepts bare numbers", () => {
    const data = base();
    data.scores.hook = { score: "8", evidence: "x" };
    data.scores.clarity = 12;
    data.scores.cta = { score: -2, evidence: "" };
    data.scores.proof = "7/10";
    const r = reviewSchema.parse(data);
    expect(r.scores.hook.score).toBe(8);
    expect(r.scores.clarity).toEqual({ score: 10, evidence: "" });
    expect(r.scores.cta.score).toBe(0);
    expect(r.scores.proof.score).toBe(7);
  });

  it("normalises persona actions and chain statuses, with safe defaults", () => {
    const data = base();
    data.personas[0].action = "Would DM them";
    data.personas[1].action = "SAVE IT";
    data.personas[2].action = "no idea";
    data.personas[3].stopped = "yes, at 'stop'";
    data.conversion_chain[0].status = "Broken";
    data.conversion_chain[1].status = "✅ pass";
    data.conversion_chain[2].status = "???";
    const r = reviewSchema.parse(data);
    expect(r.personas.map((p) => p.action).slice(0, 3)).toEqual(["dm", "save", "scroll"]);
    expect(r.personas[3].stopped).toBe(true);
    expect(r.conversionChain.map((s) => s.status).slice(0, 3)).toEqual(["break", "pass", "weak"]);
  });

  it("fills missing display-only fields with defaults", () => {
    const data = base();
    delete data.first_impression;
    delete data.rewritten_section;
    delete data.improved_cta;
    delete data.conversion_chain;
    data.break_point = "null";
    const r = reviewSchema.parse(data);
    expect(r.firstImpression).toEqual({ strangerThinks: "", promiseOrTension: "", stopsScroll: false, devices: [], verdict: "" });
    expect(r.rewrittenSection).toBeNull();
    expect(r.improvedCta).toBe("");
    expect(r.conversionChain).toEqual([]);
    expect(r.breakPoint).toBeNull();
  });

  it("caps alternative hooks at 10", () => {
    const data = base();
    data.alternative_hooks = Array.from({ length: 11 }, (_, i) => `hook ${i}`);
    expect(reviewSchema.safeParse(data).success).toBe(false);
  });
});
