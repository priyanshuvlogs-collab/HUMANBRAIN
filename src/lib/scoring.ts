import { SCORE_CATEGORIES, SCORE_WEIGHTS, type ScoreCategory } from "./constants";

/**
 * Weighted total on a 0–100 scale, rounded to one decimal.
 * Each score is 0–10 and the weights are whole percents that add up to 100,
 * so Σ(score × weight) is 0–1000 and dividing by 10 gives 0–100.
 * We never trust the model's own arithmetic.
 */
export function computeTotalScore(scores: Record<ScoreCategory, number>): number {
  let sum = 0;
  for (const category of SCORE_CATEGORIES) {
    const score = Math.min(10, Math.max(0, scores[category]));
    sum += score * SCORE_WEIGHTS[category];
  }
  return Math.round(sum) / 10;
}
