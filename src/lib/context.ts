// Turns database rows into the plain-text blocks that fill the brain's {{PLACEHOLDERS}}.
// Pure functions (no database calls) so they are easy to test.
import { CTA_TYPES, GOALS, SCORE_LABELS, formatLabel, platformLabel, type CtaType, type ScoreCategory } from "./constants";
import type { PlaceholderValues } from "./brain";
import type { Tables } from "./database.types";
import { describeMetrics, formatDate, truncate } from "./format";
import { METRIC_KEYS, averageKey, tierForPerformanceIndex, type Metrics } from "./performance";
import type { ProofCandidate, ProofSelection } from "./proof-library";

type Brand = Pick<Tables<"brand_settings">, "handle" | "niche" | "platforms"> | null;
type Offer = Pick<Tables<"offers">, "name" | "price" | "cta_type" | "cta_destination"> | null;
type Averages = Partial<Record<string, number | string | null>> | null;
type Persona = Pick<Tables<"personas">, "name" | "description" | "voice">;

export type PostInput = {
  platform: string;
  format: string;
  goal: string;
  hook: string;
  script: string;
  onScreenText: string;
};

export function brandContext(brand: Brand): string {
  if (!brand || (!brand.handle && !brand.niche)) {
    return "Not set yet — the creator hasn't filled in their brand settings.";
  }
  const parts = [
    brand.handle ? `Handle: ${brand.handle}` : null,
    brand.niche ? `Niche: ${brand.niche}` : null,
    brand.platforms.length ? `Platforms: ${brand.platforms.map(platformLabel).join(", ")}` : null,
  ];
  return parts.filter(Boolean).join(". ");
}

export function offerContext(offer: Offer): string {
  if (!offer) return "No specific offer for this post — judge it as audience-building content.";
  const price = offer.price != null ? ` — price ${formatMoney(Number(offer.price))}` : "";
  const cta = CTA_TYPES[offer.cta_type as CtaType] ?? offer.cta_type;
  const destination = offer.cta_destination ? ` (${offer.cta_destination})` : "";
  return `${offer.name}${price}. Call to action: ${cta}${destination}.`;
}

export function averageMetricsContext(platform: string, averages: Averages): string {
  const label = platformLabel(platform);
  const metrics: Metrics = Object.fromEntries(
    METRIC_KEYS.map((k) => {
      const v = averages?.[averageKey(k)];
      return [k, v == null ? null : Number(v)];
    }),
  );
  if (!averages || Object.values(metrics).every((v) => v == null)) {
    return `None yet — no average metrics recorded for ${label}.`;
  }
  return `On ${label}, a typical post gets: ${describeMetrics(metrics)}.`;
}

function proofLine(c: ProofCandidate, i: number, platform: string): string {
  const goal = GOALS[c.goal as keyof typeof GOALS] ?? c.goal;
  const script = c.script ? ` | Script: "${truncate(c.script, 280)}"` : "";
  return `${i + 1}. Performance Index ${c.performanceIndex.toFixed(2)} — ${formatLabel(platform, c.format)}, goal ${goal}. Hook: "${truncate(c.hook, 200)}"${script} | Results: ${describeMetrics(c.metrics)}`;
}

/** {{PROOF_LIBRARY}}: best and worst past posts with real metrics. */
export function proofLibraryContext(selection: ProofSelection | null, platform: string): string {
  const label = platformLabel(platform);
  if (!selection || (selection.best.length === 0 && selection.worst.length === 0)) {
    return `Empty — no past ${label} posts with real results have been recorded yet.`;
  }
  const lines = [`(Performance Index compares each post with the creator's ${label} averages: 1.0 = average, 2.0 = double.)`];
  if (selection.best.length) {
    lines.push(`BEST ${label} posts:`, ...selection.best.map((c, i) => proofLine(c, i, platform)));
  }
  if (selection.worst.length) {
    lines.push(`WORST ${label} posts:`, ...selection.worst.map((c, i) => proofLine(c, i, platform)));
  }
  return lines.join("\n");
}

export type CalibrationNoteSummary = {
  createdAt: string;
  platform: string;
  format: string;
  goal: string;
  predictedScore: number | null;
  predictedTier: string | null;
  performanceIndex: number | null;
  gapSummary: string | null;
  lesson: string | null;
  weighDifferently: { category: string; direction: string }[];
};

/** {{CALIBRATION_NOTES}}: lessons from the newest learning-mode notes. */
export function calibrationNotesContext(notes: CalibrationNoteSummary[]): string {
  if (notes.length === 0) return "None yet — no prediction misses have been analysed.";
  return notes
    .map((n) => {
      const predicted = n.predictedScore != null ? `predicted ${n.predictedScore}/100 (${n.predictedTier})` : "predicted —";
      const actual =
        n.performanceIndex != null
          ? `actual Performance Index ${n.performanceIndex.toFixed(2)} (${tierForPerformanceIndex(n.performanceIndex)})`
          : "actual —";
      const weigh = n.weighDifferently.length
        ? ` Weigh differently: ${n.weighDifferently
            .map((w) => `${SCORE_LABELS[w.category as ScoreCategory] ?? w.category} ${w.direction}`)
            .join(", ")}.`
        : "";
      const goal = GOALS[n.goal as keyof typeof GOALS] ?? n.goal;
      return `- ${formatDate(n.createdAt)}, ${platformLabel(n.platform)} ${formatLabel(n.platform, n.format)} (goal ${goal}): ${predicted}, ${actual}. ${n.lesson ?? n.gapSummary ?? ""}${weigh}`.trim();
    })
    .join("\n");
}

export function activePersonasContext(personas: Persona[]): string {
  if (personas.length === 0) return "None provided — use the default personas below.";
  return personas
    .map((p, i) => {
      const description = p.description ? ` — ${p.description}` : "";
      const voice = p.voice ? ` Voice: ${p.voice}` : "";
      return `${i + 1}. ${p.name.toUpperCase()}${description}${voice}`;
    })
    .join("\n");
}

export function buildPlaceholderValues(input: {
  platform: string;
  brand: Brand;
  offer: Offer;
  averages: Averages;
  personas: Persona[];
  proof?: ProofSelection | null;
  notes?: CalibrationNoteSummary[];
}): PlaceholderValues {
  return {
    BRAND_CONTEXT: brandContext(input.brand),
    OFFER_CONTEXT: offerContext(input.offer),
    AVERAGE_METRICS: averageMetricsContext(input.platform, input.averages),
    PROOF_LIBRARY: proofLibraryContext(input.proof ?? null, input.platform),
    CALIBRATION_NOTES: calibrationNotesContext(input.notes ?? []),
    ACTIVE_PERSONAS: activePersonasContext(input.personas),
  };
}

/** The user message: the post itself, clearly labelled. */
export function postMessage(post: PostInput, offerName: string | null): string {
  const goal = GOALS[post.goal as keyof typeof GOALS] ?? post.goal;
  const isPage = post.platform === "website";
  return [
    isPage ? "PAGE TO REVIEW" : "POST TO REVIEW",
    `Platform: ${platformLabel(post.platform)}`,
    `Format: ${formatLabel(post.platform, post.format)}`,
    `Goal: ${goal}`,
    `Offer: ${offerName ?? "none"}`,
    ...(isPage
      ? [
          "",
          "This is a web page (landing or sales page), not a social post. Read it the same way: the headline is the hook,",
          "the page copy is the script, and each persona is a visitor arriving from a link who decides in seconds whether to keep reading.",
        ]
      : []),
    "",
    isPage ? "Headline (what a visitor sees first):" : "Hook (first line / first 3 seconds):",
    post.hook.trim(),
    "",
    isPage ? "Page copy:" : "Script / caption:",
    post.script.trim() || "(none)",
    "",
    "On-screen text:",
    post.onScreenText.trim() || "(none)",
  ].join("\n");
}

function formatMoney(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}
