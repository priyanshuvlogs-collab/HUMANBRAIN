"use client";

import { useState } from "react";
import CopyButton from "@/components/CopyButton";
import ReviewLoading from "@/components/ReviewLoading";
import { useReviewRequest } from "@/components/useReviewRequest";

/** The 5 alternative hooks with Copy + "Re-review with this hook", plus a custom hook box. */
export default function HookActions({ postId, reviewId, hooks }: { postId: string; reviewId: string; hooks: string[] }) {
  const { run, running, error } = useReviewRequest();
  const [custom, setCustom] = useState("");

  const reReview = (hook: string) =>
    run({ fromPostId: postId, hook }, ({ reviewId: newId }) => `/compare?a=${reviewId}&b=${newId}`);

  return (
    <div className="space-y-3">
      {running && <ReviewLoading title="Re-reviewing with the new hook" />}
      <ol className="space-y-2">
        {hooks.map((hook, i) => (
          <li key={i} className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 sm:flex-row sm:items-center">
            <p className="min-w-0 flex-1 break-words text-sm text-zinc-900">
              <span className="mr-2 font-semibold text-violet-700">{i + 1}.</span>
              {hook}
            </p>
            <div className="flex shrink-0 gap-2">
              <CopyButton text={hook} />
              <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={running} onClick={() => reReview(hook)}>
                Re-review with this hook
              </button>
            </div>
          </li>
        ))}
      </ol>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (custom.trim()) reReview(custom.trim());
        }}
      >
        <label htmlFor="custom-hook" className="sr-only">
          Your own hook
        </label>
        <input
          id="custom-hook"
          className="input flex-1"
          placeholder="Or try your own hook…"
          maxLength={500}
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
        />
        <button className="btn-secondary" disabled={running || !custom.trim()}>
          Re-review
        </button>
      </form>
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
