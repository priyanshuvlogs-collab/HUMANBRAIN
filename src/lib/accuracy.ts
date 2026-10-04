/**
 * ACCURACY: how well the brain's predictions match what really happened.
 * Pure functions (no database), so the maths is easy to test.
 *
 * "Brain accuracy" is Spearman's rank correlation between the predicted total score and
 * the real Performance Index: it asks "do the posts the brain scored higher actually do
 * better?", ignoring the exact numbers. 1 = perfect order, 0 = no link, -1 = backwards.
 */
import { SCORE_CATEGORIES, TIERS, type ScoreCategory, type Tier } from "./constants";

/** Brain accuracy (and the per-category view) stays hidden until this many posts have results. */
export const MIN_POSTS_FOR_ACCURACY = 5;
/** How many misses to list on each side. */
export const MISSES_SHOWN = 5;

export type AccuracyPoint = {
  postId: string;
  platform: string;
  format: string;
  goal: string;
  hook: string;
  postedAt: string | null;
  /** Predicted total score, 0–100. */
  score: number;
  predictedTier: Tier;
  /** Real Performance Index (1.0 = your average). */
  pi: number;
  actualTier: Tier;
  /** The 8 category scores (0–10), or null for reviews saved in an older format. */
  categoryScores: Partial<Record<ScoreCategory, number>> | null;
};

/** 1-based ranks; tied values share the average of the positions they cover. */
export function averageRanks(values: number[]): number[] {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const ranks = new Array<number>(values.length);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].value === order[i].value) j++;
    const rank = (i + j) / 2 + 1; // positions i..j (0-based) → average 1-based rank
    for (let k = i; k <= j; k++) ranks[order[k].index] = rank;
    i = j + 1;
  }
  return ranks;
}

/**
 * Spearman's rank correlation, computed as the Pearson correlation of the average ranks
 * (the textbook way that stays correct when there are ties). Null when there are fewer
 * than 2 pairs, or when one side has no variety (e.g. every post got the same score).
 */
export function spearman(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 2) return null;
  const rx = averageRanks(xs);
  const ry = averageRanks(ys);
  const mean = (rx.length + 1) / 2; // ranks always average to (n + 1) / 2
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < rx.length; i++) {
    const dx = rx[i] - mean;
    const dy = ry[i] - mean;
    cov += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }
  if (vx === 0 || vy === 0) return null;
  // Clamp tiny floating-point overshoots (e.g. 1.0000000000000002).
  return Math.max(-1, Math.min(1, cov / Math.sqrt(vx * vy)));
}

export type Strength = "weak" | "decent" | "strong";

/** Rounded to 2 decimals, the way it's shown, so "0.30" is never labelled weak. */
export function roundRho(rho: number): number {
  return Math.round(rho * 100) / 100;
}

/** Below 0.3 weak, 0.3–0.6 decent, above 0.6 strong. */
export function strengthOf(rho: number): Strength {
  const r = roundRho(rho);
  if (r > 0.6) return "strong";
  if (r >= 0.3) return "decent";
  return "weak";
}

export const STRENGTH_LABELS: Record<Strength, string> = { weak: "Weak", decent: "Decent", strong: "Strong" };

/** One plain-English sentence for the headline number. */
export function explainAccuracy(rho: number): string {
  const strength = strengthOf(rho);
  if (strength === "strong") return "Posts the brain scores higher really do perform better for you.";
  if (strength === "decent") return "Higher scores usually mean better results, with some surprises.";
  if (roundRho(rho) <= -0.3) return "Right now, higher-scored posts have actually done worse. Check the biggest misses below.";
  return "So far the scores don't line up with your results. More results (and the lessons they teach) will help.";
}

export type Verdict = "right" | "too_high" | "too_low";

export const VERDICT_LABELS: Record<Verdict, string> = {
  right: "Right tier",
  too_high: "Predicted too high",
  too_low: "Predicted too low",
};

/** Positive = predicted a better tier than happened (overrated); negative = underrated. */
export function tierGap(point: Pick<AccuracyPoint, "predictedTier" | "actualTier">): number {
  return TIERS.indexOf(point.predictedTier) - TIERS.indexOf(point.actualTier);
}

export function verdictOf(point: Pick<AccuracyPoint, "predictedTier" | "actualTier">): Verdict {
  const gap = tierGap(point);
  return gap > 0 ? "too_high" : gap < 0 ? "too_low" : "right";
}

export type CategoryAccuracy = { category: ScoreCategory; rho: number | null; n: number };

export type AccuracySummary = {
  count: number;
  /** Null until MIN_POSTS_FOR_ACCURACY, or when there's no variety to rank. */
  rho: number | null;
  /** Empty until MIN_POSTS_FOR_ACCURACY. Strongest predictor first; categories without enough data last. */
  categories: CategoryAccuracy[];
  tiers: { exact: number; withinOne: number };
  misses: {
    overrated: AccuracyPoint[];
    underrated: AccuracyPoint[];
    overratedTotal: number;
    underratedTotal: number;
  };
};

export function computeAccuracy(points: AccuracyPoint[]): AccuracySummary {
  const count = points.length;
  const unlocked = count >= MIN_POSTS_FOR_ACCURACY;
  const rho = unlocked
    ? spearman(
        points.map((p) => p.score),
        points.map((p) => p.pi),
      )
    : null;

  const categories: CategoryAccuracy[] = unlocked
    ? SCORE_CATEGORIES.map((category) => {
        const pairs = points.flatMap((p) => {
          const s = p.categoryScores?.[category];
          return s == null || !Number.isFinite(s) ? [] : [[s, p.pi] as const];
        });
        const r =
          pairs.length >= MIN_POSTS_FOR_ACCURACY
            ? spearman(
                pairs.map(([s]) => s),
                pairs.map(([, pi]) => pi),
              )
            : null;
        return { category, rho: r, n: pairs.length };
      }).sort((a, b) => {
        if (a.rho == null || b.rho == null) return a.rho == null ? (b.rho == null ? 0 : 1) : -1;
        return b.rho - a.rho;
      })
    : [];

  const gaps = points.map(tierGap);
  const tiers = {
    exact: gaps.filter((g) => g === 0).length,
    withinOne: gaps.filter((g) => Math.abs(g) <= 1).length,
  };

  // Biggest misses, furthest tier gap first; among equals, the most confident-looking
  // prediction (overrated: highest score, worst result; underrated: lowest score, best result).
  // "Predicted high but flopped": predicted better than happened AND it landed average or below.
  // "Predicted low but took off": predicted worse than happened AND it landed above average or better.
  const overratedAll = points
    .filter((p) => tierGap(p) > 0 && (p.actualTier === "BELOW" || p.actualTier === "AVERAGE"))
    .sort((a, b) => tierGap(b) - tierGap(a) || b.score - a.score || a.pi - b.pi);
  const underratedAll = points
    .filter((p) => tierGap(p) < 0 && (p.actualTier === "ABOVE" || p.actualTier === "BREAKOUT"))
    .sort((a, b) => tierGap(a) - tierGap(b) || b.pi - a.pi || a.score - b.score);

  return {
    count,
    rho,
    categories,
    tiers,
    misses: {
      overrated: overratedAll.slice(0, MISSES_SHOWN),
      underrated: underratedAll.slice(0, MISSES_SHOWN),
      overratedTotal: overratedAll.length,
      underratedTotal: underratedAll.length,
    },
  };
}
