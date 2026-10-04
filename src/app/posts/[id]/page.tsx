import Link from "next/link";
import { notFound } from "next/navigation";
import AutoRefresh from "@/components/AutoRefresh";
import { PerformanceIndexValue } from "@/components/results/PerformanceIndex";
import { TierBadge, scoreColor } from "@/components/review/TierBadge";
import { requireUser } from "@/lib/auth";
import { GOALS, SCORE_LABELS, formatLabel, platformLabel, type Goal, type ScoreCategory, type Tier } from "@/lib/constants";
import { toDateInputValue } from "@/lib/dates";
import { formatDate, formatMetric } from "@/lib/format";
import { METRIC_KEYS, METRIC_LABELS, describePerformanceIndex, tierForPerformanceIndex } from "@/lib/performance";
import { STALE_PENDING_MS, loadPostDetail, metricsOf, type CalibrationNoteRow } from "@/lib/posts";
import { PostingForm, ResultsForm, RetryLearningButton } from "./PostForms";

// Learning mode runs after the "Save results" action responds (via after()), within this limit.
export const maxDuration = 300;

const SOURCE_LABELS: Record<string, string> = { manual: "Typed in", csv: "CSV import", api: "Auto-pulled" };

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
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

type NoteDetails = {
  what_was_right?: string[];
  what_was_missed?: string[];
  weigh_differently?: { category: string; direction: string; why?: string }[];
};

function NoteCard({ note, now }: { note: CalibrationNoteRow; now: number }) {
  const stale = note.status === "pending" && now - new Date(note.updated_at).getTime() > STALE_PENDING_MS;
  if (note.status === "pending" && !stale) {
    return (
      <div className="card flex items-center gap-3 text-sm text-zinc-700" role="status">
        <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600" aria-hidden />
        Comparing the prediction with your real results… this usually takes under a minute.
      </div>
    );
  }
  if (note.status !== "done") {
    return (
      <div className="card space-y-3">
        <p className="text-sm text-red-700" role="alert">
          {stale ? "Learning mode didn't finish (it was cut off)." : note.error || "Learning mode failed."}
        </p>
        <RetryLearningButton noteId={note.id} />
      </div>
    );
  }
  const details = (note.details ?? {}) as NoteDetails;
  return (
    <article className="card space-y-3">
      <p className="text-xs text-zinc-500">{formatDate(note.created_at)}</p>
      {note.gap_summary && <p className="text-sm font-medium text-zinc-900">{note.gap_summary}</p>}
      {note.lesson && (
        <p className="rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-900">
          <span className="font-semibold">Lesson: </span>
          {note.lesson}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {!!details.what_was_right?.length && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Got right</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-zinc-700">
              {details.what_was_right.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        )}
        {!!details.what_was_missed?.length && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Missed</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-zinc-700">
              {details.what_was_missed.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {!!details.weigh_differently?.length && (
        <ul className="flex flex-wrap gap-2">
          {details.weigh_differently.map((w, i) => (
            <li key={i} className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700" title={w.why}>
              {SCORE_LABELS[w.category as ScoreCategory] ?? "Other"} {w.direction === "less" ? "↓ less" : "↑ more"}
              {w.why && <span className="text-zinc-500"> — {w.why}</span>}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export default async function PostPage({ params }: PageProps<"/posts/[id]">) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const loaded = await loadPostDetail(supabase, id);
  if (!loaded) notFound();
  const { post, offerName, latestReview, results, notes } = loaded;
  const latest = results[0] ?? null;
  const latestPi = latest?.performance_index == null ? null : Number(latest.performance_index);
  const actualTier = tierForPerformanceIndex(latestPi);
  // eslint-disable-next-line react-hooks/purity -- a per-request timestamp in a Server Component
  const now = Date.now();
  const anyPending = notes.some((n) => n.status === "pending" && now - new Date(n.updated_at).getTime() <= STALE_PENDING_MS);

  return (
    <div className="space-y-8">
      {anyPending && <AutoRefresh />}

      <header className="card space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <span>
            {platformLabel(post.platform)} · {formatLabel(post.platform, post.format)}
          </span>
          <span>·</span>
          <span>Goal: {GOALS[post.goal as Goal] ?? post.goal}</span>
          {offerName && (
            <>
              <span>·</span>
              <span>Offer: {offerName}</span>
            </>
          )}
          <span>·</span>
          <span
            className={`rounded-full px-2 py-0.5 font-semibold ${
              post.status === "posted" ? "bg-emerald-50 text-emerald-800" : "bg-zinc-100 text-zinc-700"
            }`}
          >
            {post.status === "posted" ? `Posted${post.posted_at ? ` ${formatDate(post.posted_at)}` : ""}` : "Draft"}
          </span>
          {post.source === "csv" && <span className="rounded-full bg-sky-50 px-2 py-0.5 font-semibold text-sky-800">Imported</span>}
        </div>
        <p className="text-lg font-semibold leading-snug break-words text-zinc-900 sm:text-xl">“{post.hook}”</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg bg-zinc-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Predicted</p>
            {latestReview ? (
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <span className={`text-3xl font-bold tabular-nums ${scoreColor(Number(latestReview.total_score))}`}>
                  {Number(latestReview.total_score)}
                  <span className="text-base text-zinc-400">/100</span>
                </span>
                <TierBadge tier={latestReview.predicted_tier as Tier} />
                <Link href={`/reviews/${latestReview.id}`} className="text-sm text-violet-700 hover:underline">
                  Open review
                </Link>
              </div>
            ) : (
              <p className="mt-1 text-sm text-zinc-600">Not reviewed (imported post).</p>
            )}
          </div>
          <div className="rounded-lg bg-zinc-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Actual</p>
            {latest ? (
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <span className="text-3xl">
                  <PerformanceIndexValue pi={latestPi} />
                </span>
                {actualTier ? <TierBadge tier={actualTier} /> : <span className="text-sm text-zinc-600">{describePerformanceIndex(null)}</span>}
                <span className="text-xs text-zinc-500">Performance Index · 1.00 = your average</span>
              </div>
            ) : (
              <p className="mt-1 text-sm text-zinc-600">No results logged yet.</p>
            )}
          </div>
        </div>
        {latest && latestPi == null && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            No Performance Index: add your {platformLabel(post.platform)} averages in{" "}
            <Link href="/settings/brand" className="underline">
              Brand settings
            </Link>{" "}
            for the metrics a {GOALS[post.goal as Goal]?.toLowerCase() ?? post.goal} post is measured on. Past results are
            re-scored when you save.
          </p>
        )}
      </header>

      <Section
        title="Log real results"
        subtitle={
          latestReview
            ? "After you save, the brain compares its prediction with what happened and learns from the gap."
            : "Saved results feed the proof library used in future reviews."
        }
      >
        <ResultsForm postId={post.id} goal={post.goal} />
      </Section>

      <Section title="Posting details">
        <details className="card" open={post.status !== "posted"}>
          <summary className="cursor-pointer text-sm font-semibold">
            {post.status === "posted" ? "Edit date, link and video length" : "Mark as posted"}
          </summary>
          <div className="mt-4">
            <PostingForm
              postId={post.id}
              postedAt={toDateInputValue(post.posted_at)}
              externalPostId={post.external_post_id ?? ""}
              videoLengthSec={post.video_length_sec}
              isPosted={post.status === "posted"}
            />
          </div>
        </details>
      </Section>

      {notes.length > 0 && (
        <Section title="What the brain learned" subtitle="The 5 newest lessons are fed into every future review.">
          <div className="space-y-3">
            {notes.map((note) => (
              <NoteCard key={note.id} note={note} now={now} />
            ))}
          </div>
        </Section>
      )}

      {results.length > 0 && (
        <Section title="Results history" subtitle="The newest row is the one used for the proof library.">
          <div className="card overflow-x-auto p-0 sm:p-0">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Collected</th>
                  <th className="px-3 py-2 font-medium">PI</th>
                  <th className="px-3 py-2 font-medium">Numbers</th>
                  <th className="px-3 py-2 font-medium">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {results.map((r) => {
                  const metrics = metricsOf(r);
                  return (
                    <tr key={r.id} className="align-top">
                      <td className="whitespace-nowrap px-3 py-2">{formatDate(r.collected_at)}</td>
                      <td className="px-3 py-2">
                        <PerformanceIndexValue pi={r.performance_index == null ? null : Number(r.performance_index)} />
                      </td>
                      <td className="px-3 py-2 text-zinc-700">
                        {METRIC_KEYS.filter((k) => metrics[k] != null)
                          .map((k) => `${METRIC_LABELS[k]} ${formatMetric(k, metrics[k]!)}`)
                          .join(" · ")}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-zinc-500">{SOURCE_LABELS[r.source] ?? r.source}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}
