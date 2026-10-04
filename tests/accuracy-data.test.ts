import { describe, expect, it } from "vitest";
import { categoryScoresFrom, rowToPoint, type AccuracyRow } from "@/lib/accuracy-data";
import { SCHEMA_VERSION } from "@/lib/schema";

const review = (over: Partial<AccuracyRow["reviews"][number]> = {}) => ({
  total_score: 72,
  predicted_tier: "ABOVE",
  schema_version: SCHEMA_VERSION,
  created_at: "2026-09-01T10:00:00Z",
  scores: { hook: { score: 8, evidence: "x" }, story: { score: "6" } },
  ...over,
});
const row = (over: Partial<AccuracyRow> = {}): AccuracyRow => ({
  id: "post-1",
  platform: "instagram",
  format: "reel",
  goal: "views",
  hook: "Hook",
  posted_at: null,
  reviews: [review()],
  latest_results: [{ performance_index: "1.35" }],
  ...over,
});

describe("rowToPoint", () => {
  it("turns a row into a point with the actual tier from the PI", () => {
    expect(rowToPoint(row())).toMatchObject({
      postId: "post-1",
      score: 72,
      predictedTier: "ABOVE",
      pi: 1.35,
      actualTier: "ABOVE",
      categoryScores: { hook: 8, story: 6 },
    });
  });

  it("uses the newest review", () => {
    const point = rowToPoint(
      row({ reviews: [review(), review({ total_score: 40, predicted_tier: "BELOW", created_at: "2026-09-05T10:00:00Z" })] }),
    );
    expect(point).toMatchObject({ score: 40, predictedTier: "BELOW" });
  });

  it("flags a missing Performance Index, and skips rows that can't be compared", () => {
    expect(rowToPoint(row({ latest_results: [{ performance_index: null }] }))).toBe("needsAverages");
    expect(rowToPoint(row({ latest_results: [] }))).toBeNull();
    expect(rowToPoint(row({ reviews: [] }))).toBeNull();
    expect(rowToPoint(row({ reviews: [review({ predicted_tier: "MEGA" })] }))).toBeNull();
    expect(rowToPoint(row({ latest_results: [{ performance_index: "abc" }] }))).toBeNull();
  });

  it("puts tier boundaries in the higher tier", () => {
    const tier = (pi: number) => (rowToPoint(row({ latest_results: [{ performance_index: pi }] })) as { actualTier: string }).actualTier;
    expect([tier(0.79), tier(0.8), tier(1.2), tier(2)]).toEqual(["BELOW", "AVERAGE", "ABOVE", "BREAKOUT"]);
  });

  it("ignores category scores from reviews saved in an older format", () => {
    expect(rowToPoint(row({ reviews: [review({ schema_version: SCHEMA_VERSION - 1 })] }))).toMatchObject({ categoryScores: null });
  });
});

describe("categoryScoresFrom", () => {
  it("keeps only numeric scores for known categories", () => {
    expect(categoryScoresFrom({ hook: { score: "7" }, story: { score: null }, cta: {}, bogus: { score: 9 } })).toEqual({ hook: 7 });
    expect(categoryScoresFrom(null)).toBeNull();
    expect(categoryScoresFrom({})).toBeNull();
  });
});
