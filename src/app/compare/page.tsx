import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfidenceBadge, TierBadge, scoreColor } from "@/components/review/TierBadge";
import { requireUser } from "@/lib/auth";
import { SCORE_CATEGORIES, SCORE_LABELS, SCORE_WEIGHTS, type Confidence, type Tier } from "@/lib/constants";
import { loadReview, type LoadedReview } from "@/lib/reviews";

function Delta({ value, suffix = "" }: { value: number; suffix?: string }) {
  if (value === 0) return <span className="text-xs text-zinc-400">±0</span>;
  const rounded = Math.round(value * 10) / 10;
  return (
    <span className={`text-xs font-semibold ${value > 0 ? "text-emerald-600" : "text-red-600"}`}>
      {value > 0 ? "+" : ""}
      {rounded}
      {suffix}
    </span>
  );
}

function Column({ label, data, other }: { label: string; data: LoadedReview; other?: LoadedReview }) {
  const total = Number(data.review.total_score);
  const otherTotal = other ? Number(other.review.total_score) : null;
  const stopped = data.view ? data.view.personas.filter((p) => p.stopped).length : null;
  const otherStopped = other?.view ? other.view.personas.filter((p) => p.stopped).length : null;

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-zinc-500">{label}</span>
        <Link href={`/reviews/${data.review.id}`} className="text-xs text-violet-700 hover:underline">
          Open full review
        </Link>
      </div>
      <p className="min-h-12 font-semibold leading-snug">“{data.post.hook}”</p>
      <div className="flex items-baseline gap-2">
        <span className={`text-4xl font-bold tabular-nums ${scoreColor(total)}`}>{total}</span>
        <span className="text-zinc-400">/100</span>
        {otherTotal !== null && <Delta value={total - otherTotal} />}
      </div>
      <div className="flex flex-wrap gap-2">
        <TierBadge tier={data.review.predicted_tier as Tier} />
        <ConfidenceBadge confidence={data.review.confidence as Confidence} />
      </div>
      {data.view ? (
        <>
          <ul className="space-y-2">
            {SCORE_CATEGORIES.map((c) => {
              const score = data.view!.scores[c].score;
              const otherScore = other?.view?.scores[c].score;
              return (
                <li key={c}>
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-700">
                      {SCORE_LABELS[c]} <span className="text-zinc-400">({SCORE_WEIGHTS[c]}%)</span>
                    </span>
                    <span className="flex items-center gap-2 font-semibold tabular-nums">
                      {otherScore !== undefined && <Delta value={score - otherScore} />}
                      {score}
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-100">
                    <div className="h-full rounded-full bg-violet-500" style={{ width: `${score * 10}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="text-sm">
            <span className="font-semibold">{stopped}</span> of {data.view.personas.length} personas stopped{" "}
            {otherStopped !== null && stopped !== null && <Delta value={stopped - otherStopped} />}
          </p>
          <p className="text-sm">
            <span className="text-zinc-500">Break point: </span>
            <span className={data.view.breakPoint ? "font-medium text-red-700" : "text-emerald-700"}>
              {data.view.breakPoint ?? "None — the chain holds"}
            </span>
          </p>
        </>
      ) : (
        <p className="text-sm text-zinc-500">Older format — open the full review to read it.</p>
      )}
    </div>
  );
}

export default async function ComparePage({ searchParams }: PageProps<"/compare">) {
  const { a, b } = await searchParams;
  if (typeof a !== "string" || typeof b !== "string") notFound();
  const { supabase } = await requireUser();
  const [left, right] = await Promise.all([loadReview(supabase, a), loadReview(supabase, b)]);
  if (!left || !right) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Compare versions</h1>
        <p className="text-sm text-zinc-600">Same post, different hook. Deltas on the right are versus the left.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Column label="Version A" data={left} />
        <Column label="Version B" data={right} other={left} />
      </div>
    </div>
  );
}
