import Link from "next/link";
import { PerformanceIndexValue } from "@/components/results/PerformanceIndex";
import { scoreColor } from "@/components/review/TierBadge";
import { requireUser } from "@/lib/auth";
import { formatLabel, platformLabel } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { loadPostList } from "@/lib/posts";

export default async function PostsPage() {
  const { supabase, userId } = await requireUser();
  const posts = await loadPostList(supabase, userId);
  const withResults = posts.filter((p) => p.resultsCount > 0).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Posts</h1>
          <p className="text-sm text-zinc-600">
            Log what really happened. {withResults} of {posts.length} post{posts.length === 1 ? " has" : "s have"} results.
          </p>
        </div>
        <Link href="/import" className="btn-secondary">
          Import CSV
        </Link>
      </div>

      {posts.length === 0 ? (
        <div className="card text-center">
          <p className="font-semibold">No posts yet</p>
          <p className="mt-1 text-sm text-zinc-600">Every reviewed post shows up here. You can also import past posts from a CSV.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link href="/reviews/new" className="btn-primary">
              Review a post
            </Link>
            <Link href="/import" className="btn-secondary">
              Import CSV
            </Link>
          </div>
        </div>
      ) : (
        <ul className="space-y-2">
          {posts.map((p) => (
            <li key={p.id}>
              <Link href={`/posts/${p.id}`} className="card flex items-center gap-4 transition hover:border-violet-300">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.hook}</p>
                  <p className="text-xs text-zinc-500">
                    {platformLabel(p.platform)} · {formatLabel(p.platform, p.format)} ·{" "}
                    {p.status === "posted" ? `Posted${p.posted_at ? ` ${formatDate(p.posted_at)}` : ""}` : "Draft"}
                    {p.source === "csv" && " · imported"}
                    {p.root_post_id && " · re-review"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-4 text-right">
                  <div className="w-12">
                    <p className="text-[10px] uppercase tracking-wide text-zinc-400">Score</p>
                    <p className={`font-bold tabular-nums ${p.score == null ? "text-zinc-400" : scoreColor(p.score)}`}>
                      {p.score ?? "—"}
                    </p>
                  </div>
                  <div className="w-12">
                    <p className="text-[10px] uppercase tracking-wide text-zinc-400">PI</p>
                    <PerformanceIndexValue pi={p.performanceIndex} />
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
