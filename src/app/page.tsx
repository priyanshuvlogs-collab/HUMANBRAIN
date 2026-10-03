import Link from "next/link";
import { TierBadge, scoreColor } from "@/components/review/TierBadge";
import { requireUser } from "@/lib/auth";
import { formatLabel, platformLabel, type Tier } from "@/lib/constants";

export default async function HomePage() {
  const { supabase, userId } = await requireUser();
  const { data: reviews } = await supabase
    .from("reviews")
    .select("id, total_score, predicted_tier, created_at, posts(hook, platform, format, root_post_id)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reviews</h1>
          <p className="text-sm text-zinc-600">Your most recent post reviews.</p>
        </div>
        <Link href="/reviews/new" className="btn-primary">
          + New review
        </Link>
      </div>

      {!reviews || reviews.length === 0 ? (
        <div className="card text-center">
          <p className="font-semibold">No reviews yet</p>
          <p className="mt-1 text-sm text-zinc-600">
            Start with your <Link href="/settings/brand" className="text-violet-700 underline">brand settings</Link>, then run
            your first review.
          </p>
          <Link href="/reviews/new" className="btn-primary mt-4">
            Review a post
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {reviews.map((r) => (
            <li key={r.id}>
              <Link href={`/reviews/${r.id}`} className="card flex items-center gap-4 transition hover:border-violet-300">
                <span className={`w-14 shrink-0 text-center text-2xl font-bold tabular-nums ${scoreColor(Number(r.total_score))}`}>
                  {Number(r.total_score)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.posts?.hook}</p>
                  <p className="text-xs text-zinc-500">
                    {r.posts && `${platformLabel(r.posts.platform)} · ${formatLabel(r.posts.platform, r.posts.format)}`}
                    {r.posts?.root_post_id && " · re-review"} ·{" "}
                    {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </p>
                </div>
                <span className="hidden sm:block">
                  <TierBadge tier={r.predicted_tier as Tier} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
