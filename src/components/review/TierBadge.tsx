import type { Confidence, Tier } from "@/lib/constants";

const TIER_STYLES: Record<Tier, string> = {
  BELOW: "bg-red-100 text-red-800 ring-red-200",
  AVERAGE: "bg-zinc-100 text-zinc-800 ring-zinc-200",
  ABOVE: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  BREAKOUT: "bg-violet-600 text-white ring-violet-600",
};

const TIER_LABELS: Record<Tier, string> = {
  BELOW: "Below average",
  AVERAGE: "Average",
  ABOVE: "Above average",
  BREAKOUT: "Breakout",
};

export function TierBadge({ tier }: { tier: Tier }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-sm font-bold ring-1 ${TIER_STYLES[tier] ?? TIER_STYLES.AVERAGE}`}>
      {TIER_LABELS[tier] ?? tier}
    </span>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const dots = { LOW: 1, MEDIUM: 2, HIGH: 3 }[confidence] ?? 1;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-sm font-medium text-zinc-700 ring-1 ring-zinc-200">
      <span className="flex gap-0.5" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span key={i} className={`h-2 w-2 rounded-full ${i <= dots ? "bg-violet-600" : "bg-zinc-200"}`} />
        ))}
      </span>
      {confidence.charAt(0) + confidence.slice(1).toLowerCase()} confidence
    </span>
  );
}

export function scoreColor(score: number) {
  if (score >= 75) return "text-emerald-600";
  if (score >= 55) return "text-amber-600";
  return "text-red-600";
}
