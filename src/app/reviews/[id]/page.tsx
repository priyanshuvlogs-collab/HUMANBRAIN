import Link from "next/link";
import { notFound } from "next/navigation";
import CopyButton from "@/components/CopyButton";
import ConversionChain from "@/components/review/ConversionChain";
import FullRewrite from "@/components/review/FullRewrite";
import HookActions from "@/components/review/HookActions";
import PersonaCard from "@/components/review/PersonaCard";
import ScoreBars from "@/components/review/ScoreBars";
import { ConfidenceBadge, TierBadge, scoreColor } from "@/components/review/TierBadge";
import { requireUser } from "@/lib/auth";
import { GOALS, formatLabel, platformLabel, type Confidence, type Goal, type Tier } from "@/lib/constants";
import { loadReview, loadVersions } from "@/lib/reviews";

const OUTCOME_LABELS: Record<string, string> = {
  VIEWS: "Views",
  ENGAGEMENT: "Engagement",
  SAVES_SHARES: "Saves & shares",
  LEADS: "Leads",
  SALES: "Sales",
};

function Section({ title, children, subtitle }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="text-sm text-zinc-600">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

export default async function ReviewPage({ params }: PageProps<"/reviews/[id]">) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const loaded = await loadReview(supabase, id);
  if (!loaded) notFound();
  const { review, post, offerName, view } = loaded;
  const versions = await loadVersions(supabase, post);
  const total = Number(review.total_score);

  return (
    <div className="space-y-8">
      {/* Summary */}
      <header className="card space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <span>{platformLabel(post.platform)} · {formatLabel(post.platform, post.format)}</span>
          <span>·</span>
          <span>Goal: {GOALS[post.goal as Goal] ?? post.goal}</span>
          {offerName && (
            <>
              <span>·</span>
              <span>Offer: {offerName}</span>
            </>
          )}
          <span>·</span>
          <time dateTime={review.created_at}>{new Date(review.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</time>
        </div>
        <p className="text-lg font-semibold leading-snug break-words text-zinc-900 sm:text-xl">“{post.hook}”</p>
        {post.source_url && (
          <p className="break-all text-xs text-zinc-500">
            From:{" "}
            <a href={post.source_url} target="_blank" rel="noopener noreferrer nofollow" className="text-violet-700 underline">
              {post.source_url}
            </a>
          </p>
        )}
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <span className={`text-5xl font-bold tabular-nums ${scoreColor(total)}`}>{total}</span>
            <span className="text-lg text-zinc-400">/100</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <TierBadge tier={review.predicted_tier as Tier} />
            <ConfidenceBadge confidence={review.confidence as Confidence} />
            {review.predicted_outcome && (
              <span className="inline-flex rounded-full bg-sky-50 px-3 py-1 text-sm font-medium text-sky-800 ring-1 ring-sky-200">
                Likely drives: {OUTCOME_LABELS[review.predicted_outcome] ?? review.predicted_outcome}
              </span>
            )}
          </div>
        </div>
        <Link href={`/posts/${post.id}`} className="btn-secondary w-full sm:w-auto">
          Posted it? Log real results →
        </Link>
        {review.confidence === "LOW" && (
          <p className="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
            Why low confidence? The brain has little or no proof library yet (your past posts with real results), so it
            can&apos;t compare against what actually worked for you. This improves as you{" "}
            <Link href="/posts" className="underline">
              log results
            </Link>
            .
          </p>
        )}
        {review.provisional_format && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Using a temporary output format: the brain file is missing its final section. Results still work; the layout may
            change slightly once the full brain file is added.
          </p>
        )}
      </header>

      {!view ? (
        <div className="card">
          <p className="mb-3 text-sm text-zinc-600">This review was saved in an older format, so only the full text is shown.</p>
          <pre className="whitespace-pre-wrap break-words text-sm text-zinc-800">{review.raw_response}</pre>
        </div>
      ) : (
        <>
          <Section title="The 1.5-second test" subtitle="What a stranger gets from the first line alone.">
            <div className="card grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">A stranger thinks it&apos;s about</p>
                <p className="mt-1 text-sm">{view.firstImpression.strangerThinks || "—"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Promise / tension</p>
                <p className="mt-1 text-sm">{view.firstImpression.promiseOrTension || "—"}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    view.firstImpression.stopsScroll ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                  }`}
                >
                  {view.firstImpression.stopsScroll ? "Stops the scroll" : "Doesn't stop the scroll"}
                </span>
                {view.firstImpression.devices.map((d) => (
                  <span key={d} className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-700">
                    {d}
                  </span>
                ))}
              </div>
              {view.firstImpression.verdict && <p className="text-sm text-zinc-700 sm:col-span-2">{view.firstImpression.verdict}</p>}
            </div>
          </Section>

          <Section
            title="Audience panel"
            subtitle={`${view.personas.filter((p) => p.stopped).length} of ${view.personas.length} stopped scrolling.`}
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {view.personas.map((p, i) => (
                <PersonaCard key={i} persona={p} />
              ))}
            </div>
          </Section>

          <div className="grid gap-8 lg:grid-cols-2">
            <Section title="Scorecard" subtitle="The total above is computed from these weights.">
              <div className="card">
                <ScoreBars scores={view.scores} />
              </div>
            </Section>
            <Section title="Conversion path" subtitle="Where belief holds — and where it breaks.">
              <div className="card">
                <ConversionChain chain={view.conversionChain} breakPoint={view.breakPoint} />
              </div>
            </Section>
          </div>

          <Section title="Prediction">
            <div className="card space-y-3">
              <div className="flex flex-wrap gap-2">
                <TierBadge tier={view.prediction.tier} />
                <ConfidenceBadge confidence={view.prediction.confidence} />
              </div>
              {view.prediction.summary && <p className="text-sm text-zinc-800">{view.prediction.summary}</p>}
              {view.prediction.similarPosts.length > 0 && (
                <p className="text-xs text-zinc-500">Compared with: {view.prediction.similarPosts.join(" · ")}</p>
              )}
            </div>
          </Section>

          <Section title="Alternative hooks" subtitle="Copy one, or re-review the same post with it and compare side by side.">
            <div className="card">
              <HookActions postId={post.id} reviewId={review.id} hooks={view.alternativeHooks} />
            </div>
          </Section>

          {view.rewrittenSection && (
            <Section title="Rewrite" subtitle={view.rewrittenSection.section ? `Weakest part: ${view.rewrittenSection.section}` : undefined}>
              <div className="card grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Original</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-zinc-500 line-through decoration-zinc-300">
                    {view.rewrittenSection.original}
                  </p>
                </div>
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Rewrite</p>
                    <CopyButton text={view.rewrittenSection.rewrite} />
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-zinc-900">{view.rewrittenSection.rewrite}</p>
                </div>
                {view.rewrittenSection.why && <p className="text-xs text-zinc-600 md:col-span-2">{view.rewrittenSection.why}</p>}
              </div>
            </Section>
          )}

          {view.fullRewrite && (
            <Section
              title={post.platform === "website" ? "Full rewrite of the page" : "Full rewrite"}
              subtitle="The whole piece rewritten with every fix applied. Re-review it to see the new score side by side."
            >
              <div className="card">
                <FullRewrite postId={post.id} reviewId={review.id} rewrite={view.fullRewrite} />
              </div>
            </Section>
          )}

          {view.improvedCta && (
            <Section title="Improved CTA">
              <div className="card flex flex-col gap-3 sm:flex-row sm:items-center">
                <p className="min-w-0 flex-1 break-words text-sm font-medium text-zinc-900">{view.improvedCta}</p>
                <CopyButton text={view.improvedCta} />
              </div>
            </Section>
          )}

          <details className="card">
            <summary className="cursor-pointer text-sm font-semibold">Full analysis</summary>
            <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm text-zinc-800">{review.raw_response}</pre>
          </details>
        </>
      )}

      {versions.length > 1 && (
        <Section title="Versions of this post">
          <ul className="card divide-y divide-zinc-100 p-0 sm:p-0">
            {versions.map((v) => (
              <li key={v.reviewId} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                <p className="min-w-0 flex-1 break-words text-sm">
                  <span className={`mr-2 font-bold tabular-nums ${scoreColor(v.totalScore)}`}>{v.totalScore}</span>
                  {v.hook}
                </p>
                {v.reviewId === review.id ? (
                  <span className="text-xs font-semibold text-zinc-500">This version</span>
                ) : (
                  <div className="flex gap-3 text-sm">
                    <Link href={`/reviews/${v.reviewId}`} className="text-violet-700 hover:underline">
                      Open
                    </Link>
                    <Link href={`/compare?a=${review.id}&b=${v.reviewId}`} className="text-violet-700 hover:underline">
                      Compare
                    </Link>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <p className="text-xs text-zinc-400">
        Model: {review.model} · Brain version: {review.brain_version}
      </p>
    </div>
  );
}
