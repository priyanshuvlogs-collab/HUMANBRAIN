"use client";

import CopyButton from "@/components/CopyButton";
import ReviewLoading from "@/components/ReviewLoading";
import { useReviewRequest } from "@/components/useReviewRequest";

type Rewrite = { hook: string; script: string; onScreenText: string; changes: string[] };

/** The complete rewritten script, with copy buttons and "Re-review this rewrite" (opens side by side). */
export default function FullRewrite({ postId, reviewId, rewrite }: { postId: string; reviewId: string; rewrite: Rewrite }) {
  const { run, running, error } = useReviewRequest();
  const full = [rewrite.hook, rewrite.script].filter(Boolean).join("\n\n");
  // A re-review needs a hook; fall back to the script's first line if the reply left it empty.
  const hook = (rewrite.hook || rewrite.script.split("\n").find((l) => l.trim()) || "").trim();

  return (
    <div className="space-y-4">
      {running && <ReviewLoading title="Re-reviewing the rewritten script" />}
      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">New hook</p>
          <CopyButton text={rewrite.hook} />
        </div>
        <p className="mt-1 break-words text-sm font-medium text-zinc-900">{rewrite.hook}</p>
      </div>
      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Full script</p>
          <CopyButton text={rewrite.script} />
        </div>
        <p className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-zinc-50 p-3 text-sm text-zinc-900">{rewrite.script}</p>
      </div>
      {rewrite.onScreenText && (
        <div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">On-screen text</p>
            <CopyButton text={rewrite.onScreenText} />
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-zinc-800">{rewrite.onScreenText}</p>
        </div>
      )}
      {rewrite.changes.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">What changed and why</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-zinc-700">
            {rewrite.changes.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ol>
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          className="btn-primary"
          disabled={running}
          onClick={() =>
            run(
              { fromPostId: postId, hook: hook.slice(0, 500), script: rewrite.script.slice(0, 10_000), onScreenText: rewrite.onScreenText.slice(0, 2_000) },
              ({ reviewId: newId }) => `/compare?a=${reviewId}&b=${newId}`,
            )
          }
        >
          Re-review this rewrite
        </button>
        <CopyButton text={full} label="Copy hook + script" />
      </div>
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
