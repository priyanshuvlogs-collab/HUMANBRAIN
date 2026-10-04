import { describePerformanceIndex } from "@/lib/performance";

export function piColor(pi: number | null) {
  if (pi == null) return "text-zinc-400";
  if (pi >= 2) return "text-violet-700";
  if (pi >= 1.2) return "text-emerald-600";
  if (pi >= 0.8) return "text-zinc-700";
  return "text-red-600";
}

/** "1.35" in the tier colour, or "—" when there isn't enough data. */
export function PerformanceIndexValue({ pi, className = "" }: { pi: number | null; className?: string }) {
  return (
    <span className={`font-bold tabular-nums ${piColor(pi)} ${className}`} title={describePerformanceIndex(pi)}>
      {pi == null ? "—" : pi.toFixed(2)}
    </span>
  );
}
