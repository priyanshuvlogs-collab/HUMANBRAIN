"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type ReviewResponse = { reviewId: string; postId: string };

/**
 * Sends a review request to /api/review and navigates when it's done.
 * Guards against double-clicks (a ref, because state updates aren't instant).
 */
export function useReviewRequest() {
  const router = useRouter();
  const inFlight = useRef(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(body: Record<string, unknown>, nextUrl: (data: ReviewResponse) => string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as (Partial<ReviewResponse> & { error?: string }) | null;
      if (res.ok && data?.reviewId && data.postId) {
        // Keep the loading screen up until the next page appears.
        router.push(nextUrl({ reviewId: data.reviewId, postId: data.postId }));
        return;
      }
      setError(
        data?.error ??
          "Something went wrong. The review may still finish — check Reviews in a minute before trying again.",
      );
    } catch {
      setError("Lost connection while the review was running. It may still finish — check Reviews in a minute.");
    }
    inFlight.current = false;
    setRunning(false);
  }

  return { run, running, error };
}
