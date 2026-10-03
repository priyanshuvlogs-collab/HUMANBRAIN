// Turns database rows into the plain-text blocks that fill the brain's {{PLACEHOLDERS}}.
// Pure functions (no database calls) so they are easy to test.
import { CTA_TYPES, GOALS, formatLabel, platformLabel, type CtaType } from "./constants";
import type { PlaceholderValues } from "./brain";
import type { Tables } from "./database.types";

type Brand = Pick<Tables<"brand_settings">, "handle" | "niche" | "platforms"> | null;
type Offer = Pick<Tables<"offers">, "name" | "price" | "cta_type" | "cta_destination"> | null;
type Averages = Omit<Tables<"platform_averages">, "id" | "user_id" | "updated_at"> | null;
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
  if (!averages) return `None yet — no average metrics recorded for ${label}.`;
  const items: string[] = [];
  if (averages.avg_views != null) items.push(`${formatNumber(Number(averages.avg_views))} views/reach`);
  if (averages.avg_hold_3s_pct != null) items.push(`${averages.avg_hold_3s_pct}% 3-second hold`);
  if (averages.avg_watch_pct != null) items.push(`${averages.avg_watch_pct}% average watch`);
  if (averages.avg_saves != null) items.push(`${formatNumber(Number(averages.avg_saves))} saves`);
  if (averages.avg_shares != null) items.push(`${formatNumber(Number(averages.avg_shares))} shares`);
  if (averages.avg_dms != null) items.push(`${formatNumber(Number(averages.avg_dms))} DMs`);
  if (items.length === 0) return `None yet — no average metrics recorded for ${label}.`;
  return `On ${label}, a typical post gets ${items.join(", ")}.`;
}

// Filled from real results in Phase 2.
export function proofLibraryContext(): string {
  return "Empty — no past posts with real results have been recorded yet.";
}

// Filled from learning-mode notes in Phase 2.
export function calibrationNotesContext(): string {
  return "None yet — no prediction misses have been analysed.";
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
}): PlaceholderValues {
  return {
    BRAND_CONTEXT: brandContext(input.brand),
    OFFER_CONTEXT: offerContext(input.offer),
    AVERAGE_METRICS: averageMetricsContext(input.platform, input.averages),
    PROOF_LIBRARY: proofLibraryContext(),
    CALIBRATION_NOTES: calibrationNotesContext(),
    ACTIVE_PERSONAS: activePersonasContext(input.personas),
  };
}

/** The user message: the post itself, clearly labelled. */
export function postMessage(post: PostInput, offerName: string | null): string {
  const goal = GOALS[post.goal as keyof typeof GOALS] ?? post.goal;
  return [
    "POST TO REVIEW",
    `Platform: ${platformLabel(post.platform)}`,
    `Format: ${formatLabel(post.platform, post.format)}`,
    `Goal: ${goal}`,
    `Offer: ${offerName ?? "none"}`,
    "",
    "Hook (first line / first 3 seconds):",
    post.hook.trim(),
    "",
    "Script / caption:",
    post.script.trim() || "(none)",
    "",
    "On-screen text:",
    post.onScreenText.trim() || "(none)",
  ].join("\n");
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function formatMoney(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}
