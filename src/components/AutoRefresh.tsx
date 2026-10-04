"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Re-fetches the page's server data every few seconds (used while learning mode runs
 * in the background). Stops by itself after `forMs` so a stuck job can't refresh forever.
 */
export default function AutoRefresh({ everyMs = 4000, forMs = 6 * 60 * 1000 }: { everyMs?: number; forMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => {
      if (Date.now() - started > forMs) return clearInterval(id);
      if (document.visibilityState === "visible") router.refresh();
    }, everyMs);
    return () => clearInterval(id);
  }, [router, everyMs, forMs]);
  return null;
}
