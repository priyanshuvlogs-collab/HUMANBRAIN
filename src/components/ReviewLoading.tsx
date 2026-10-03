"use client";

import { useEffect, useState } from "react";

const MESSAGES = [
  "Showing your hook to the audience panel…",
  "The Skeptic is looking for hype…",
  "The Scroller's thumb is already moving…",
  "The Ready Buyer is deciding who to trust…",
  "Scoring hook, story and proof…",
  "Tracing the conversion path…",
  "Writing alternative hooks…",
];

/** Full-screen loading state for a review (they take 20–60 seconds). */
export default function ReviewLoading({ title = "Reviewing your post" }: { title?: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const message = MESSAGES[Math.floor(seconds / 6) % MESSAGES.length];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4 backdrop-blur-sm" role="status" aria-live="polite">
      <div className="card w-full max-w-sm text-center">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-violet-200 border-t-violet-600" />
        <p className="font-semibold">{title}</p>
        <p className="mt-1 min-h-10 text-sm text-zinc-600">{message}</p>
        <p className="mt-3 text-xs text-zinc-500">
          {seconds}s · usually 20–60 seconds. You can keep this tab open; the result is saved automatically.
        </p>
      </div>
    </div>
  );
}
