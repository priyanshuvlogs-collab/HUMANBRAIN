import { describe, expect, it } from "vitest";
import {
  MIN_POSTS_FOR_ACCURACY,
  averageRanks,
  computeAccuracy,
  explainAccuracy,
  spearman,
  strengthOf,
  tierGap,
  verdictOf,
  type AccuracyPoint,
} from "@/lib/accuracy";
import type { Tier } from "@/lib/constants";

describe("averageRanks", () => {
  it("gives tied values the average of their positions", () => {
    expect(averageRanks([5, 5, 5, 8, 8, 3, 3])).toEqual([4, 4, 4, 6.5, 6.5, 1.5, 1.5]);
    expect(averageRanks([10, 20, 30])).toEqual([1, 2, 3]);
    expect(averageRanks([])).toEqual([]);
  });
});

describe("spearman", () => {
  // Reference values from scipy.stats.spearmanr.
  it.each([
    ["with ties", [60, 70, 70, 80, 90, 50], [1.2, 0.8, 1.5, 2.0, 1.1, 0.3], 0.4638168285219587],
    ["heavy ties", [5, 5, 5, 8, 8, 3, 3], [0.5, 1.0, 1.0, 2.0, 1.8, 0.2, 0.9], 0.8581163303210333],
    ["mixed", [72, 45, 88, 61, 55, 90, 33, 67, 79, 50], [1.4, 0.6, 2.2, 0.9, 1.1, 1.0, 0.4, 1.3, 0.7, 0.8], 0.6363636363636362],
  ])("matches scipy (%s)", (_name, xs, ys, expected) => {
    expect(spearman(xs, ys)).toBeCloseTo(expected, 12);
  });

  it("is exactly ±1 for perfect order, whatever the spacing", () => {
    expect(spearman([1, 2, 3, 4, 5], [0.1, 0.5, 0.9, 1.5, 3])).toBe(1);
    expect(spearman([1, 2, 3, 4, 5], [5, 4, 3, 2, 1])).toBe(-1);
  });

  it("is null without enough data or without variety", () => {
    expect(spearman([1], [2])).toBeNull();
    expect(spearman([], [])).toBeNull();
    expect(spearman([70, 70, 70], [0.5, 1, 2])).toBeNull();
    expect(spearman([1, 2, 3], [1, 1, 1])).toBeNull();
    expect(spearman([1, 2], [1])).toBeNull();
  });
});

describe("strength labels", () => {
  it("uses the thresholds: below 0.3 weak, 0.3–0.6 decent, above 0.6 strong (on the shown, rounded value)", () => {
    expect(strengthOf(0.29)).toBe("weak");
    expect(strengthOf(0.296)).toBe("decent"); // shown as 0.30
    expect(strengthOf(0.3)).toBe("decent");
    expect(strengthOf(0.6)).toBe("decent");
    expect(strengthOf(0.604)).toBe("decent"); // shown as 0.60
    expect(strengthOf(0.61)).toBe("strong");
    expect(strengthOf(-0.8)).toBe("weak");
  });

  it("explains backwards predictions differently from no link", () => {
    expect(explainAccuracy(-0.5)).toMatch(/actually done worse/);
    expect(explainAccuracy(0.1)).toMatch(/don't line up/);
    expect(explainAccuracy(0.45)).toMatch(/usually/);
    expect(explainAccuracy(0.8)).toMatch(/really do perform better/);
  });
});

let id = 0;
function point(score: number, pi: number, predictedTier: Tier, actualTier: Tier, categoryScores: AccuracyPoint["categoryScores"] = null): AccuracyPoint {
  id++;
  return {
    postId: `p${id}`,
    platform: "instagram",
    format: "reel",
    goal: "views",
    hook: `Hook ${id}`,
    postedAt: null,
    score,
    predictedTier,
    pi,
    actualTier,
    categoryScores,
  };
}

describe("tier verdicts", () => {
  it("compares the predicted tier with the tier the result landed in", () => {
    expect(tierGap({ predictedTier: "BREAKOUT", actualTier: "BELOW" })).toBe(3);
    expect(verdictOf({ predictedTier: "ABOVE", actualTier: "BELOW" })).toBe("too_high");
    expect(verdictOf({ predictedTier: "AVERAGE", actualTier: "BREAKOUT" })).toBe("too_low");
    expect(verdictOf({ predictedTier: "ABOVE", actualTier: "ABOVE" })).toBe("right");
  });
});

describe("computeAccuracy", () => {
  it(`hides Brain accuracy and the category view below ${MIN_POSTS_FOR_ACCURACY} posts`, () => {
    const s = computeAccuracy([
      point(80, 2.1, "BREAKOUT", "BREAKOUT"),
      point(40, 0.5, "BELOW", "BELOW"),
      point(60, 1.0, "AVERAGE", "AVERAGE"),
      point(70, 1.3, "ABOVE", "ABOVE"),
    ]);
    expect(s.count).toBe(4);
    expect(s.rho).toBeNull();
    expect(s.categories).toEqual([]);
    expect(s.tiers).toEqual({ exact: 4, withinOne: 4 });
  });

  it("computes the headline, tier agreement and per-category correlations", () => {
    const cats = (hook: number, story: number, cta: number) => ({ hook, story, cta });
    const s = computeAccuracy([
      point(80, 2.4, "BREAKOUT", "BREAKOUT", cats(9, 9, 5)),
      point(70, 1.5, "ABOVE", "ABOVE", cats(8, 7, 5)),
      point(60, 1.0, "ABOVE", "AVERAGE", cats(5, 6, 5)),
      point(50, 0.7, "AVERAGE", "BELOW", cats(7, 4, 5)),
      point(40, 0.3, "BELOW", "BELOW", cats(3, 2, 5)),
    ]);
    expect(s.rho).toBe(1);
    expect(s.tiers).toEqual({ exact: 3, withinOne: 5 });
    // story tracks results perfectly, hook nearly, cta has no variety (always 5) → last, null
    expect(s.categories[0]).toEqual({ category: "story", rho: 1, n: 5 });
    expect(s.categories[1].category).toBe("hook");
    expect(s.categories[1].rho).toBeCloseTo(0.9, 10);
    const cta = s.categories.find((c) => c.category === "cta");
    expect(cta).toEqual({ category: "cta", rho: null, n: 5 });
    // categories missing from every review (older format) have n = 0 and no correlation
    expect(s.categories.find((c) => c.category === "proof")).toEqual({ category: "proof", rho: null, n: 0 });
    expect(s.categories.slice(-1)[0].rho).toBeNull();
  });

  it("lists the biggest misses on each side, furthest tier gap first", () => {
    const s = computeAccuracy([
      point(90, 0.4, "BREAKOUT", "BELOW"), // overrated by 3
      point(75, 0.5, "ABOVE", "BELOW"), // overrated by 2
      point(85, 0.6, "ABOVE", "BELOW"), // overrated by 2, higher score → before the 75
      point(35, 3.0, "BELOW", "BREAKOUT"), // underrated by 3
      point(50, 1.3, "AVERAGE", "ABOVE"), // underrated by 1
      point(60, 1.0, "AVERAGE", "AVERAGE"), // right
    ]);
    expect(s.misses.overrated.map((p) => p.score)).toEqual([90, 85, 75]);
    expect(s.misses.underrated.map((p) => p.score)).toEqual([35, 50]);
    expect(s.misses.overratedTotal).toBe(3);
    expect(s.misses.underratedTotal).toBe(2);
  });

  it("shows at most 5 misses per side but counts them all", () => {
    const many = Array.from({ length: 8 }, (_, i) => point(70 + i, 0.3, "ABOVE", "BELOW"));
    const s = computeAccuracy(many);
    expect(s.misses.overrated).toHaveLength(5);
    expect(s.misses.overratedTotal).toBe(8);
    expect(s.misses.overrated[0].score).toBe(77);
  });

  it("is empty for no data", () => {
    expect(computeAccuracy([])).toEqual({
      count: 0,
      rho: null,
      categories: [],
      tiers: { exact: 0, withinOne: 0 },
      misses: { overrated: [], underrated: [], overratedTotal: 0, underratedTotal: 0 },
    });
  });
});

describe("misses follow the spec literally", () => {
  it("a post predicted Breakout that landed Above average didn't flop; Below → Average didn't take off", () => {
    const s = computeAccuracy([point(85, 1.9, "BREAKOUT", "ABOVE"), point(30, 0.9, "BELOW", "AVERAGE"), point(80, 0.9, "BREAKOUT", "AVERAGE")]);
    expect(s.misses.overrated.map((p) => p.score)).toEqual([80]);
    expect(s.misses.underrated).toEqual([]);
  });

  it("a category scored on too few posts reports how many it has", () => {
    const pts = Array.from({ length: 6 }, (_, i) =>
      point(40 + i * 10, 0.5 + i * 0.3, "AVERAGE", "AVERAGE", i < 4 ? { hook: i + 3 } : null),
    );
    expect(computeAccuracy(pts).categories.find((c) => c.category === "hook")).toEqual({ category: "hook", rho: null, n: 4 });
  });
});
