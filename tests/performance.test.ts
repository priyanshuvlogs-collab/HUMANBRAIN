import { describe, expect, it } from "vitest";
import { GOAL_WEIGHTS, computePerformanceIndex, describePerformanceIndex } from "@/lib/performance";

const averages = {
  avg_views: 10_000,
  avg_watch_pct: 40,
  avg_likes: 500,
  avg_comments: 50,
  avg_saves: 100,
  avg_shares: 40,
  avg_dms: 10,
  avg_link_clicks: 20,
  avg_leads: 5,
  avg_sales: 2,
};

describe("computePerformanceIndex", () => {
  it("each goal's weights add up to 1", () => {
    for (const weights of Object.values(GOAL_WEIGHTS)) {
      const sum = Object.values(weights).reduce((a, b) => a + (b ?? 0), 0);
      expect(sum).toBeCloseTo(1, 10);
    }
  });

  it("exactly average → 1.0, double → 2.0, half → 0.5", () => {
    expect(computePerformanceIndex("views", { views: 10_000, avg_watch_pct: 40 }, averages)).toBe(1);
    expect(computePerformanceIndex("views", { views: 20_000, avg_watch_pct: 80 }, averages)).toBe(2);
    expect(computePerformanceIndex("views", { views: 5_000, avg_watch_pct: 20 }, averages)).toBe(0.5);
  });

  it("weights by goal: a leads post is judged on DMs/clicks/leads, not views", () => {
    const metrics = { views: 50_000, avg_watch_pct: 80, dms: 5, link_clicks: 10, leads: 2.5 };
    // views goal: 0.6*5 + 0.4*2 = 3.8
    expect(computePerformanceIndex("views", metrics, averages)).toBe(3.8);
    // leads goal: every lead metric is half the average → 0.5
    expect(computePerformanceIndex("leads", metrics, averages)).toBe(0.5);
  });

  it("re-scales weights when a metric is missing (missing ≠ zero)", () => {
    // views only (watch % not recorded): 2x views → 2.0, not 0.6*2 = 1.2
    expect(computePerformanceIndex("views", { views: 20_000 }, averages)).toBe(2);
    expect(computePerformanceIndex("views", { views: 20_000, avg_watch_pct: null }, averages)).toBe(2);
  });

  it("skips metrics whose average is missing or zero", () => {
    expect(computePerformanceIndex("views", { views: 20_000, avg_watch_pct: 40 }, { avg_views: 10_000, avg_watch_pct: 0 })).toBe(2);
    expect(computePerformanceIndex("views", { views: 20_000 }, { avg_views: null })).toBeNull();
  });

  it("caps a single metric at 10x so one outlier can't dominate", () => {
    expect(computePerformanceIndex("views", { views: 1_000_000, avg_watch_pct: 40 }, averages)).toBe(0.6 * 10 + 0.4 * 1);
  });

  it("returns null when nothing usable was recorded or no averages exist", () => {
    expect(computePerformanceIndex("sales", { views: 5_000 }, averages)).toBeNull();
    expect(computePerformanceIndex("views", { views: 5_000 }, null)).toBeNull();
    expect(computePerformanceIndex("views", {}, averages)).toBeNull();
  });

  it("an actual result of 0 counts (it's data, not missing)", () => {
    expect(computePerformanceIndex("leads", { dms: 0, link_clicks: 0, leads: 0 }, averages)).toBe(0);
  });

  it("engagement mixes comments, saves, shares, likes", () => {
    // comments 2x (.3), saves 1x (.25), shares 1x (.25), likes 0.5x (.2) = .6+.25+.25+.1 = 1.2
    expect(computePerformanceIndex("engagement", { comments: 100, saves: 100, shares: 40, likes: 250 }, averages)).toBe(1.2);
  });
});

describe("describePerformanceIndex", () => {
  it("labels ranges in plain English", () => {
    expect(describePerformanceIndex(null)).toBe("Not enough data");
    expect(describePerformanceIndex(0.5)).toBe("Below average");
    expect(describePerformanceIndex(1)).toBe("About average");
    expect(describePerformanceIndex(1.5)).toBe("Above average");
    expect(describePerformanceIndex(2.4)).toBe("Breakout");
  });
});
