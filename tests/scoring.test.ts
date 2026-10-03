import { describe, expect, it } from "vitest";
import { SCORE_CATEGORIES, SCORE_WEIGHTS, type ScoreCategory } from "@/lib/constants";
import { computeTotalScore } from "@/lib/scoring";

const all = (n: number) => Object.fromEntries(SCORE_CATEGORIES.map((c) => [c, n])) as Record<ScoreCategory, number>;

describe("computeTotalScore", () => {
  it("weights add up to 100% and match the spec", () => {
    expect(Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
    expect(SCORE_WEIGHTS).toEqual({ hook: 25, clarity: 10, curiosity: 15, story: 15, proof: 10, value: 10, offer_fit: 10, cta: 5 });
  });

  it("all 10s → 100, all 0s → 0, all 5s → 50", () => {
    expect(computeTotalScore(all(10))).toBe(100);
    expect(computeTotalScore(all(0))).toBe(0);
    expect(computeTotalScore(all(5))).toBe(50);
  });

  it("applies the weights (hook counts 5x more than CTA)", () => {
    expect(computeTotalScore({ ...all(0), hook: 10 })).toBe(25);
    expect(computeTotalScore({ ...all(0), cta: 10 })).toBe(5);
    expect(computeTotalScore({ ...all(0), curiosity: 10, story: 10 })).toBe(30);
  });

  it("matches a hand-calculated mixed example", () => {
    // 7*25 + 8*10 + 6*15 + 4*15 + 5*10 + 6*10 + 7*10 + 5*5 = 610 → 61.0
    const scores = { hook: 7, clarity: 8, curiosity: 6, story: 4, proof: 5, value: 6, offer_fit: 7, cta: 5 };
    expect(computeTotalScore(scores)).toBe(61);
  });

  it("handles half points exactly", () => {
    // 7.5*25 = 187.5, 8.5*10 = 85, rest 0 → 272.5 → 27.3 (rounded to one decimal)
    expect(computeTotalScore({ ...all(0), hook: 7.5, clarity: 8.5 })).toBe(27.3);
    // 6.5 everywhere → 65
    expect(computeTotalScore(all(6.5))).toBe(65);
  });

  it("clamps out-of-range scores instead of trusting them", () => {
    expect(computeTotalScore({ ...all(10), hook: 15 })).toBe(100);
    expect(computeTotalScore({ ...all(0), hook: -3 })).toBe(0);
  });
});
