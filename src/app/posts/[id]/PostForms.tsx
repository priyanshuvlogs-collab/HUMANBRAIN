"use client";

import { useState } from "react";
import ActionForm from "@/components/ActionForm";
import { GOALS, type Goal } from "@/lib/constants";
import { GOAL_WEIGHTS, METRIC_LABELS, type MetricKey } from "@/lib/performance";
import { retryLearning, savePostingDetails, saveResults } from "./actions";

const METRIC_GROUPS: { title: string; keys: MetricKey[] }[] = [
  { title: "Reach", keys: ["views", "hold_3s_pct", "avg_watch_pct"] },
  { title: "Engagement", keys: ["likes", "comments", "saves", "shares"] },
  { title: "Conversions", keys: ["dms", "link_clicks", "leads", "sales"] },
];

export function ResultsForm({ postId, goal }: { postId: string; goal: string }) {
  const counted = GOAL_WEIGHTS[goal as Goal] ?? {};
  return (
    <ActionForm action={saveResults} className="card space-y-4" resetOnSuccess>
      {(pending) => (
        <>
          <input type="hidden" name="postId" value={postId} />
          <p className="text-sm text-zinc-600">
            Copy the numbers from your insights. Fill in what you have — blanks are fine. Fields marked{" "}
            <span className="font-semibold text-violet-700">★</span> count towards the Performance Index for a{" "}
            {GOALS[goal as Goal]?.toLowerCase() ?? goal} post.
          </p>
          {METRIC_GROUPS.map((group) => (
            <fieldset key={group.title}>
              <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">{group.title}</legend>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {group.keys.map((key) => (
                  <div key={key}>
                    <label htmlFor={`metric-${key}`} className="mb-1 block text-xs font-medium text-zinc-600">
                      {METRIC_LABELS[key]}
                      {counted[key] != null && (
                        <>
                          <span className="ml-1 text-violet-700" aria-hidden>
                            ★
                          </span>
                          <span className="sr-only"> (counts towards the Performance Index)</span>
                        </>
                      )}
                    </label>
                    <input id={`metric-${key}`} name={key} inputMode="decimal" className="input" autoComplete="off" />
                  </div>
                ))}
              </div>
            </fieldset>
          ))}
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="sm:max-w-xs">
              <label htmlFor="collected_at" className="mb-1 block text-xs font-medium text-zinc-600">
                Date collected (blank = today)
              </label>
              <input id="collected_at" name="collected_at" type="date" className="input" />
            </div>
            <button className="btn-primary" disabled={pending}>
              {pending ? "Saving…" : "Save results"}
            </button>
          </div>
        </>
      )}
    </ActionForm>
  );
}

type PostingProps = {
  postId: string;
  postedAt: string;
  externalPostId: string;
  videoLengthSec: number | null;
  isPosted: boolean;
};

/** Collapsible "Posting details" card. Keeps its own open state, so it doesn't snap shut after saving. */
export function PostingDetails(props: PostingProps) {
  const [open, setOpen] = useState(!props.isPosted);
  return (
    <details className="card" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer text-sm font-semibold">
        {props.isPosted ? "Edit date, link and video length" : "Mark as posted"}
      </summary>
      <div className="mt-4">
        <PostingForm {...props} />
      </div>
    </details>
  );
}

function PostingForm(props: PostingProps) {
  return (
    <ActionForm action={savePostingDetails} className="space-y-4">
      {(pending) => (
        <>
          <input type="hidden" name="postId" value={props.postId} />
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="posted_at" className="mb-1 block text-xs font-medium text-zinc-600">
                Date posted
              </label>
              <input id="posted_at" name="posted_at" type="date" defaultValue={props.postedAt} className="input" />
            </div>
            <div>
              <label htmlFor="external_post_id" className="mb-1 block text-xs font-medium text-zinc-600">
                Post link or ID (optional)
              </label>
              <input
                id="external_post_id"
                name="external_post_id"
                defaultValue={props.externalPostId}
                placeholder="https://www.instagram.com/reel/…"
                className="input"
              />
            </div>
            <div>
              <label htmlFor="video_length_sec" className="mb-1 block text-xs font-medium text-zinc-600">
                Video length in seconds (optional)
              </label>
              <input
                id="video_length_sec"
                name="video_length_sec"
                inputMode="numeric"
                defaultValue={props.videoLengthSec ?? ""}
                className="input"
              />
            </div>
          </div>
          <button className="btn-secondary" disabled={pending}>
            {pending ? "Saving…" : props.isPosted ? "Save posting details" : "Mark as posted"}
          </button>
        </>
      )}
    </ActionForm>
  );
}

export function RetryLearningButton({ noteId }: { noteId: string }) {
  return (
    <ActionForm action={retryLearning}>
      {(pending) => (
        <>
          <input type="hidden" name="noteId" value={noteId} />
          <button className="btn-secondary" disabled={pending}>
            {pending ? "Starting…" : "Try again"}
          </button>
        </>
      )}
    </ActionForm>
  );
}
