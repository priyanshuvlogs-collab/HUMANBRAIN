import { SCORE_CATEGORIES, SCORE_LABELS, SCORE_WEIGHTS, type ScoreCategory } from "@/lib/constants";

function barColor(score: number) {
  if (score >= 7.5) return "bg-emerald-500";
  if (score >= 5) return "bg-amber-400";
  return "bg-red-500";
}

export default function ScoreBars({ scores }: { scores: Record<ScoreCategory, { score: number; evidence: string }> }) {
  return (
    <ul className="space-y-3">
      {SCORE_CATEGORIES.map((c) => {
        const { score, evidence } = scores[c];
        return (
          <li key={c}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium text-zinc-800">
                {SCORE_LABELS[c]} <span className="text-xs font-normal text-zinc-500">({SCORE_WEIGHTS[c]}%)</span>
              </span>
              <span className="font-semibold tabular-nums">{score}/10</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-zinc-100">
              <div className={`h-full rounded-full ${barColor(score)}`} style={{ width: `${score * 10}%` }} />
            </div>
            {evidence && <p className="mt-1 text-xs text-zinc-500">{evidence}</p>}
          </li>
        );
      })}
    </ul>
  );
}
