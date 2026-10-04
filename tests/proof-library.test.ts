import { describe, expect, it } from "vitest";
import { calibrationNotesContext, proofLibraryContext, averageMetricsContext, type CalibrationNoteSummary } from "@/lib/context";
import { selectProofExamples, type ProofCandidate } from "@/lib/proof-library";

const candidate = (id: string, pi: number, rootId = id): ProofCandidate => ({
  postId: id,
  rootId,
  format: "reel",
  goal: "leads",
  hook: `Hook ${id}`,
  script: "",
  performanceIndex: pi,
  metrics: { views: 1000 * pi, dms: 10 },
});

describe("selectProofExamples", () => {
  it("picks the 5 best and 5 worst by Performance Index", () => {
    const pool = Array.from({ length: 14 }, (_, i) => candidate(`p${i}`, i / 2));
    const { best, worst } = selectProofExamples(pool);
    expect(best.map((c) => c.performanceIndex)).toEqual([6.5, 6, 5.5, 5, 4.5]);
    expect(worst.map((c) => c.performanceIndex)).toEqual([0, 0.5, 1, 1.5, 2]);
  });

  it("never shows the same post as both best and worst when there are few posts", () => {
    const { best, worst } = selectProofExamples([candidate("a", 1.5), candidate("b", 0.4), candidate("c", 2.2)]);
    expect(best.map((c) => c.postId)).toEqual(["c", "a"]);
    expect(worst.map((c) => c.postId)).toEqual(["b"]);
    expect(selectProofExamples([candidate("solo", 1)])).toEqual({ best: [candidate("solo", 1)], worst: [] });
    expect(selectProofExamples([])).toEqual({ best: [], worst: [] });
  });

  it("skips the post being reviewed and its other versions", () => {
    const pool = [candidate("root", 3), candidate("v2", 2.5, "root"), candidate("other", 1)];
    const { best, worst } = selectProofExamples(pool, { excludeRootId: "root" });
    expect([...best, ...worst].map((c) => c.postId)).toEqual(["other"]);
  });
});

describe("proofLibraryContext", () => {
  it("explains when there are no past results", () => {
    expect(proofLibraryContext(null, "tiktok")).toBe("Empty — no past TikTok posts with real results have been recorded yet.");
    expect(proofLibraryContext({ best: [], worst: [] }, "instagram")).toMatch(/^Empty/);
  });

  it("lists best and worst posts with their real numbers", () => {
    const text = proofLibraryContext({ best: [candidate("a", 2.4)], worst: [candidate("b", 0.35)] }, "instagram");
    expect(text).toContain("BEST Instagram posts:");
    expect(text).toContain('1. Performance Index 2.40 — Reel, goal Leads. Hook: "Hook a"');
    expect(text).toContain("Views / reach: 2,400, DMs: 10");
    expect(text).toContain("WORST Instagram posts:");
    expect(text).toContain("Performance Index 0.35");
  });
});

describe("averageMetricsContext", () => {
  it("describes every recorded average, including the Phase 2 ones", () => {
    expect(averageMetricsContext("instagram", { avg_views: "5000", avg_watch_pct: 35, avg_leads: 2, avg_sales: null })).toBe(
      "On Instagram, a typical post gets: Views / reach: 5,000, Avg watch %: 35%, Leads: 2.",
    );
    expect(averageMetricsContext("youtube", { avg_views: null })).toMatch(/None yet/);
  });
});

describe("calibrationNotesContext", () => {
  const note: CalibrationNoteSummary = {
    createdAt: "2026-09-20T10:00:00Z",
    platform: "instagram",
    format: "reel",
    goal: "leads",
    predictedScore: 61,
    predictedTier: "ABOVE",
    performanceIndex: 0.45,
    gapSummary: "Hook got attention but no DMs.",
    lesson: "Cap leads posts at AVERAGE without proof.",
    weighDifferently: [
      { category: "proof", direction: "more" },
      { category: "offer_fit", direction: "less" },
    ],
  };

  it("summarises each lesson on one line", () => {
    expect(calibrationNotesContext([note])).toBe(
      "- Sep 20, 2026, Instagram Reel (goal Leads): predicted 61/100 (ABOVE), actual Performance Index 0.45 (BELOW). " +
        "Cap leads posts at AVERAGE without proof. Weigh differently: Proof more, Offer fit less.",
    );
  });

  it("falls back to the gap summary and handles missing numbers", () => {
    const line = calibrationNotesContext([
      { ...note, lesson: null, predictedScore: null, performanceIndex: null, weighDifferently: [] },
    ]);
    expect(line).toContain("predicted —, actual —. Hook got attention but no DMs.");
  });

  it("says so when there are no notes", () => {
    expect(calibrationNotesContext([])).toMatch(/^None yet/);
  });
});
