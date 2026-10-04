import Link from "next/link";
import { PerformanceIndexValue } from "@/components/results/PerformanceIndex";
import { scoreColor } from "@/components/review/TierBadge";
import { requireUser } from "@/lib/auth";
import { formatLabel, platformLabel } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { POSTS_PER_PAGE, loadPostList } from "@/lib/posts";

export default async function PostsPage({ searchParams }: PageProps<"/posts">) {
  const pageParam = (await searchParams).page;
  const page = Math.max(1, Math.floor(Number(Array.isArray(pageParam) ? pageParam[0] : pageParam) || 1));
  const { supabase, userId } = await requireUser();
  const { posts, total, withResults } = await loadPostList(supabase, userId, page);
  const pages = Math.max(1, Math.ceil(total / POSTS_PER_PAGE));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Posts</h1>
          <p className="text-sm text-zinc-600">
            Log what really happened. {withResults} of {total} post{total === 1 ? " has" : "s have"} results.
          </p>
        </div>
        <Link href="/import" className="btn-secondary">
          Import CSV
        </Link>
      </div>

      {total === 0 ? (
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

      {pages > 1 && (
        <nav className="flex items-center justify-between gap-3 text-sm" aria-label="Pages">
          {page > 1 ? (
            <Link href={`/posts?page=${page - 1}`} className="btn-secondary">
              ← Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="text-zinc-500">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link href={`/posts?page=${page + 1}`} className="btn-secondary">
              Older →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
