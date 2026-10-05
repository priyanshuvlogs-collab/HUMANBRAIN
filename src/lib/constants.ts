// Shared lists and settings used across the app.

export const PLATFORMS = {
  instagram: { label: "Instagram", formats: { reel: "Reel", carousel: "Carousel", post: "Post", story: "Story" } },
  tiktok: { label: "TikTok", formats: { video: "Video", carousel: "Carousel" } },
  youtube: { label: "YouTube Shorts", formats: { short: "Short" } },
  // A landing or sales page, reviewed like a post: headline = hook, page copy = script.
  website: { label: "Website", formats: { landing_page: "Landing page", sales_page: "Sales page" } },
} as const;

export type Platform = keyof typeof PLATFORMS;
export const PLATFORM_KEYS = Object.keys(PLATFORMS) as Platform[];

export function isValidFormat(platform: Platform, format: string): boolean {
  return format in PLATFORMS[platform].formats;
}

export function platformLabel(platform: string): string {
  return PLATFORMS[platform as Platform]?.label ?? platform;
}

export function formatLabel(platform: string, format: string): string {
  const formats = PLATFORMS[platform as Platform]?.formats as Record<string, string> | undefined;
  return formats?.[format] ?? format;
}

export const GOALS = {
  views: "Views",
  engagement: "Engagement",
  leads: "Leads",
  sales: "Sales",
} as const;
export type Goal = keyof typeof GOALS;
export const GOAL_KEYS = Object.keys(GOALS) as Goal[];

export const CTA_TYPES = {
  dm_keyword: "DM keyword",
  link: "Link",
  booking: "Booking",
} as const;
export type CtaType = keyof typeof CTA_TYPES;
export const CTA_TYPE_KEYS = Object.keys(CTA_TYPES) as CtaType[];

export const TIERS = ["BELOW", "AVERAGE", "ABOVE", "BREAKOUT"] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_LABELS: Record<Tier, string> = {
  BELOW: "Below average",
  AVERAGE: "Average",
  ABOVE: "Above average",
  BREAKOUT: "Breakout",
};

export const CONFIDENCE_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export const OUTCOMES = ["VIEWS", "ENGAGEMENT", "SAVES_SHARES", "LEADS", "SALES"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const SCORE_CATEGORIES = [
  "hook",
  "clarity",
  "curiosity",
  "story",
  "proof",
  "value",
  "offer_fit",
  "cta",
] as const;
export type ScoreCategory = (typeof SCORE_CATEGORIES)[number];

// Weights in whole percent (must add up to 100). Whole numbers keep the total exact.
export const SCORE_WEIGHTS: Record<ScoreCategory, number> = {
  hook: 25,
  clarity: 10,
  curiosity: 15,
  story: 15,
  proof: 10,
  value: 10,
  offer_fit: 10,
  cta: 5,
};

export const SCORE_LABELS: Record<ScoreCategory, string> = {
  hook: "Hook stop power",
  clarity: "Clarity",
  curiosity: "Curiosity",
  story: "Story",
  proof: "Proof",
  value: "Value",
  offer_fit: "Offer fit",
  cta: "CTA",
};

export const MAX_ACTIVE_PERSONAS = 10;
