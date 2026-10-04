import Link from "next/link";
import { TierBadge, scoreColor } from "@/components/review/TierBadge";
import { PerformanceIndexValue } from "@/components/results/PerformanceIndex";
import {
  MIN_POSTS_FOR_ACCURACY,
  STRENGTH_LABELS,
  VERDICT_LABELS,
  computeAccuracy,
  explainAccuracy,
  roundRho,
  strengthOf,
  verdictOf,
  type AccuracyPoint,
} from "@/lib/accuracy";
import { loadAccuracyData } from "@/lib/accuracy-data";
import { requireUser } from "@/lib/auth";
import { PLATFORM_KEYS, TIER_LABELS, formatLabel, platformLabel, type Platform } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import AccuracyScatter, { type ScatterPoint } from "./AccuracyScatter";
import CategoryBars from "./CategoryBars";

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="text-sm text-zinc-600">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function StatTile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="card">
      <p className="text-sm text-zinc-600">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-900">{value}</p>
      {detail && <p className="text-xs text-zinc-500">{detail}</p>}
    </div>
  );
}

const percent = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "—");

function MissList({ title, empty, rows, total }: { title: string; empty: string; rows: AccuracyPoint[]; total: number }) {
  return (
    <Card title={title}>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">{empty}</p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {rows.map((p) => (
            <li key={p.postId} className="py-3 first:pt-0 last:pb-0">
              <Link href={`/posts/${p.postId}`} className="block rounded-md hover:bg-zinc-50">
                <p className="line-clamp-2 break-words text-sm font-medium text-zinc-900">“{p.hook}”</p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {platformLabel(p.platform)} · {formatLabel(p.platform, p.format)}
                  {p.postedAt && ` · ${formatDate(p.postedAt)}`}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-600">
                  <span>Predicted</span>
                  <span className={`font-bold tabular-nums ${scoreColor(p.score)}`}>{p.score}</span>
                  <TierBadge tier={p.predictedTier} />
                  <span aria-hidden>→</span>
                  <span>Actual</span>
                  <PerformanceIndexValue pi={p.pi} />
                  <TierBadge tier={p.actualTier} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {total > rows.length && (
        <p className="text-xs text-zinc-500">…and {total - rows.length} more under &ldquo;Show the data&rdquo; above.</p>
      )}
    </Card>
  );
}

export default async function AccuracyPage({ searchParams }: PageProps<"/accuracy">) {
  const raw = (await searchParams).platform;
  const platformParam = Array.isArray(raw) ? raw[0] : raw;
  const platform = PLATFORM_KEYS.includes(platformParam as Platform) ? (platformParam as Platform) : null;

  const { supabase, userId } = await requireUser();
  const data = await loadAccuracyData(supabase, userId, platform);
  const summary = computeAccuracy(data.points);
  const unlocked = summary.count >= MIN_POSTS_FOR_ACCURACY;

  const scatterPoints: ScatterPoint[] = data.points.map((p) => ({
    postId: p.postId,
    score: p.score,
    pi: p.pi,
    verdict: verdictOf(p),
    hook: p.hook,
    where: `${platformLabel(p.platform)} · ${formatLabel(p.platform, p.format)}`,
    predicted: TIER_LABELS[p.predictedTier],
    actual: TIER_LABELS[p.actualTier],
  }));
  const filters: { key: Platform | null; label: string }[] = [
    { key: null, label: "All platforms" },
    ...PLATFORM_KEYS.map((key) => ({ key, label: platformLabel(key) })),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Brain accuracy</h1>
        <p className="text-sm text-zinc-600">How well the brain&apos;s predictions match what really happened to your posts.</p>
      </div>

      {/* One filter row; it scopes everything below. */}
      <nav aria-label="Platform" className="flex flex-wrap gap-2">
        {filters.map((f) => {
          const current = f.key === platform;
          return (
            <Link
              key={f.label}
              href={f.key ? `/accuracy?platform=${f.key}` : "/accuracy"}
              aria-current={current ? "page" : undefined}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 ${
                current ? "bg-violet-600 text-white ring-violet-600" : "bg-white text-zinc-700 ring-zinc-200 hover:bg-zinc-50"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </nav>

      {data.error ? (
        <div className="card" role="alert">
          <p className="font-semibold text-red-700">Couldn&apos;t load your results</p>
          <p className="mt-1 text-sm text-zinc-600">Something went wrong while loading. Refresh the page to try again.</p>
        </div>
      ) : summary.count === 0 ? (
        <div className="card text-center">
          <p className="font-semibold">Nothing to compare yet</p>
          <p className="mt-1 text-sm text-zinc-600">
            Review a post, publish it, then log its real numbers. Each reviewed post with results becomes one dot here.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link href="/reviews/new" className="btn-primary">
              Review a post
            </Link>
            <Link href="/posts" className="btn-secondary">
              Log results
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Hero figure: the one number this page leads with. */}
          <section className="card">
            {unlocked && summary.rho != null ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-6">
                <p className="text-6xl font-semibold leading-none text-zinc-900">{roundRho(summary.rho).toFixed(2)}</p>
                <div className="space-y-1">
                  <p className="text-lg font-semibold text-zinc-900">{STRENGTH_LABELS[strengthOf(summary.rho)]}</p>
                  <p className="text-sm text-zinc-700">{explainAccuracy(summary.rho)}</p>
                </div>
              </div>
            ) : unlocked ? (
              <p className="text-sm text-zinc-700">
                Not enough variety to rank yet: every post got the same score, or the same result. Log a few more.
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-zinc-900">
                  Brain accuracy unlocks at {MIN_POSTS_FOR_ACCURACY} reviewed posts with results. You have {summary.count}.
                </p>
                <div
                  className="h-2 w-full max-w-sm overflow-hidden rounded-full bg-violet-100"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={MIN_POSTS_FOR_ACCURACY}
                  aria-valuenow={summary.count}
                  aria-label="Posts with results"
                >
                  <div className="h-full rounded-full bg-violet-600" style={{ width: `${(summary.count / MIN_POSTS_FOR_ACCURACY) * 100}%` }} />
                </div>
                <p className="text-sm text-zinc-600">
                  Below 5 posts the number would mostly be luck. Keep{" "}
                  <Link href="/posts" className="text-violet-700 underline">
                    logging results
                  </Link>
                  .
                </p>
              </div>
            )}
            <p className="mt-3 text-xs text-zinc-500">
              Spearman rank correlation between predicted score and real Performance Index: 1.00 = the brain ranks your posts in
              exactly the order they performed, 0 = no link. Below 0.3 is weak, 0.3–0.6 decent, above 0.6 strong.
            </p>
          </section>

          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile label="Posts measured" value={String(summary.count)} detail="Reviewed posts with real results" />
            <StatTile
              label="Right tier"
              value={percent(summary.tiers.exact, summary.count)}
              detail={`${summary.tiers.exact} of ${summary.count} predicted the tier that happened`}
            />
            <StatTile
              label="Within one tier"
              value={percent(summary.tiers.withinOne, summary.count)}
              detail={`${summary.tiers.withinOne} of ${summary.count} were off by at most one tier`}
            />
          </div>

          <Card
            title="Predicted score vs real result"
            subtitle="Each dot is a post. Dots above the “Your average” line beat your usual results; dots further right were scored higher. Click a dot (tap twice on a phone) to open the post."
          >
            <AccuracyScatter points={scatterPoints} />
            <details className="rounded-lg border border-zinc-200">
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-zinc-700">
                Show the data ({summary.count} post{summary.count === 1 ? "" : "s"})
              </summary>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="border-y border-zinc-200 text-xs text-zinc-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Post</th>
                      <th className="px-3 py-2 font-medium">Score</th>
                      <th className="px-3 py-2 font-medium">Predicted</th>
                      <th className="px-3 py-2 font-medium">PI</th>
                      <th className="px-3 py-2 font-medium">Actual</th>
                      <th className="px-3 py-2 font-medium">Verdict</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 tabular-nums">
                    {[...data.points]
                      .sort((a, b) => b.score - a.score)
                      .map((p) => (
                        <tr key={p.postId} className="align-top">
                          <td className="px-3 py-2">
                            <Link href={`/posts/${p.postId}`} className="line-clamp-1 break-all text-violet-700 hover:underline">
                              {p.hook}
                            </Link>
                            <span className="text-xs text-zinc-500">
                              {platformLabel(p.platform)} · {formatLabel(p.platform, p.format)}
                            </span>
                          </td>
                          <td className="px-3 py-2">{p.score}</td>
                          <td className="whitespace-nowrap px-3 py-2">{TIER_LABELS[p.predictedTier]}</td>
                          <td className="px-3 py-2">{p.pi.toFixed(2)}</td>
                          <td className="whitespace-nowrap px-3 py-2">{TIER_LABELS[p.actualTier]}</td>
                          <td className="whitespace-nowrap px-3 py-2">{VERDICT_LABELS[verdictOf(p)]}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </details>
          </Card>

          <Card
            title="Which scores predict your results"
            subtitle="Each score category's own rank correlation with your real results. Trust the brain most where the bar is long and blue."
          >
            {unlocked ? (
              <CategoryBars categories={summary.categories} />
            ) : (
              <p className="text-sm text-zinc-500">Unlocks with Brain accuracy at {MIN_POSTS_FOR_ACCURACY} posts.</p>
            )}
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <MissList
              title="Predicted high, flopped"
              empty="None yet: no post the brain rated higher landed average or below."
              rows={summary.misses.overrated}
              total={summary.misses.overratedTotal}
            />
            <MissList
              title="Predicted low, took off"
              empty="None yet: no post the brain rated lower landed above average."
              rows={summary.misses.underrated}
              total={summary.misses.underratedTotal}
            />
          </div>
        </>
      )}

      {(data.awaitingResults > 0 || data.needsAverages > 0 || data.notReviewed > 0) && (
        <section className="space-y-1 text-sm text-zinc-600">
          <p className="font-medium text-zinc-700">Not included</p>
          <ul className="list-disc space-y-1 pl-5">
            {data.awaitingResults > 0 && (
              <li>
                {data.awaitingResults} reviewed post{data.awaitingResults === 1 ? " is" : "s are"} waiting for results.{" "}
                <Link href="/posts" className="text-violet-700 underline">
                  Log them
                </Link>
                .
              </li>
            )}
            {data.needsAverages > 0 && (
              <li>
                {data.needsAverages} reviewed post{data.needsAverages === 1 ? " has" : "s have"} results but no Performance Index.{" "}
                <Link href="/settings/brand" className="text-violet-700 underline">
                  Add your averages
                </Link>{" "}
                for the metrics their goal uses.
              </li>
            )}
            {data.notReviewed > 0 && (
              <li>
                {data.notReviewed} post{data.notReviewed === 1 ? " has" : "s have"} results but no review (e.g. imported), so there&apos;s no
                prediction to compare. They still feed the proof library.
              </li>
            )}
          </ul>
        </section>
      )}
    </div>
  );
}
