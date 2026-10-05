/**
 * PROVISIONAL schema for the JSON block at the end of every review.
 *
 * The brain file we have stops before its JSON spec, so this matches
 * prompts/provisional-output-format.md. When the real spec arrives, only this
 * file (plus the fixture) changes: the UI reads the stable `ReviewView` shape
 * produced by the `.transform()` at the bottom, and SCHEMA_VERSION goes up.
 *
 * Validation is strict only where a wrong value would break the product
 * (the 8 scores, tier, confidence). Display-only fields fall back to sensible
 * defaults instead of failing, so we don't pay for a retry over a typo.
 */
import * as z from "zod";
import {
  CONFIDENCE_LEVELS,
  OUTCOMES,
  SCORE_CATEGORIES,
  TIERS,
  type Confidence,
  type Outcome,
  type ScoreCategory,
  type Tier,
} from "./constants";

export const SCHEMA_VERSION = 1;

// ---- helpers ---------------------------------------------------------------

/** "Saves & Shares" → "SAVES_SHARES" */
export function normalizeEnumValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function withAliases<T extends readonly string[]>(values: T, aliases: Record<string, T[number]>) {
  return z.preprocess((v) => {
    const n = normalizeEnumValue(v);
    return typeof n === "string" && n in aliases ? aliases[n] : n;
  }, z.enum(values));
}

const tierSchema = withAliases(TIERS, {
  BELOW_AVERAGE: "BELOW",
  UNDER: "BELOW",
  LOW: "BELOW",
  AVG: "AVERAGE",
  ABOVE_AVERAGE: "ABOVE",
  HIGH: "ABOVE",
  VIRAL: "BREAKOUT",
  BREAK_OUT: "BREAKOUT",
});

const confidenceSchema = withAliases(CONFIDENCE_LEVELS, {
  MED: "MEDIUM",
  MODERATE: "MEDIUM",
  MID: "MEDIUM",
});

const outcomeSchema = withAliases(OUTCOMES, {
  VIEW: "VIEWS",
  REACH: "VIEWS",
  ENGAGE: "ENGAGEMENT",
  SAVES: "SAVES_SHARES",
  SHARES: "SAVES_SHARES",
  SAVE_SHARE: "SAVES_SHARES",
  SAVES_AND_SHARES: "SAVES_SHARES",
  SHARES_SAVES: "SAVES_SHARES",
  LEAD: "LEADS",
  DMS: "LEADS",
  SALE: "SALES",
})
  .nullable()
  .catch(null);

/** Lenient text: missing → "", numbers → string. */
const text = z.preprocess(
  (v) => (v == null ? "" : typeof v === "string" ? v : typeof v === "number" ? String(v) : v),
  z.string(),
).catch("");

/** Text that may be absent: "", "null", "none", "N/A", "-" all become null. */
const optionalText = z.preprocess(
  (v) => (typeof v === "string" && !/^\s*(null|none|n\/?a|-+)?\s*$/i.test(v) ? v : null),
  z.string().nullable(),
);

const lenientBool = z
  .preprocess((v) => {
    if (typeof v === "string") return /^\s*(y|yes|true|stopped)\b/i.test(v);
    return v;
  }, z.boolean())
  .catch(false);

const PERSONA_ACTIONS = ["scroll", "like", "comment", "save", "share", "dm", "click"] as const;
export type PersonaAction = (typeof PERSONA_ACTIONS)[number];

const ACTION_PATTERNS: [PersonaAction, RegExp][] = [
  ["click", /\bclick(s|ed|ing)?\b/],
  ["share", /\bshar(e|es|ed|ing)\b/],
  ["save", /\bsav(e|es|ed|ing)\b/],
  ["comment", /\bcomment(s|ed|ing)?\b/],
  ["like", /\blik(e|es|ed|ing)\b/],
  ["scroll", /\bscroll(s|ed|ing)?\b/],
];

const personaAction = z
  .preprocess((v) => {
    if (typeof v !== "string") return v;
    const s = v.trim().toLowerCase();
    if ((PERSONA_ACTIONS as readonly string[]).includes(s)) return s;
    if (/\bdms?\b|message/.test(s)) return "dm";
    // Whole words only, so "likely to save" is a save, not a like.
    return ACTION_PATTERNS.find(([, pattern]) => pattern.test(s))?.[0] ?? s;
  }, z.enum(PERSONA_ACTIONS))
  .catch("scroll");

const CHAIN_STATUSES = ["pass", "weak", "break"] as const;
export type ChainStatus = (typeof CHAIN_STATUSES)[number];

const chainStatus = z
  .preprocess((v) => {
    if (typeof v !== "string") return v;
    const s = v.trim().toLowerCase();
    if ((CHAIN_STATUSES as readonly string[]).includes(s)) return s;
    if (/\b(break|breaks|broken|fail|fails|failed|lost)\b/.test(s)) return "break";
    if (/weak|partial|shaky|maybe/.test(s)) return "weak";
    if (/pass|ok|strong|yes|holds/.test(s)) return "pass";
    return s;
  }, z.enum(CHAIN_STATUSES))
  .catch("weak");

/** A score may come as 7, "7", "7/10" or { score: 7, evidence: "..." }. Clamped to 0–10. */
const scoreNumber = z.preprocess((v) => {
  if (typeof v === "string") return parseFloat(v);
  return v;
}, z.number().refine(Number.isFinite, "score must be a number").transform((n) => Math.min(10, Math.max(0, n))));

const scoreEntry = z.preprocess(
  (v) => (typeof v === "number" || typeof v === "string" ? { score: v } : v),
  z.object({ score: scoreNumber, evidence: text }),
);

// ---- raw shape (what the model writes) ---------------------------------------

const rawReviewSchema = z.object({
  first_impression: z
    .object({
      stranger_thinks: text,
      promise_or_tension: text,
      stops_scroll: lenientBool,
      devices: z.array(text).catch([]),
      verdict: text,
    })
    .partial()
    .catch({}),
  personas: z
    .array(
      z.object({
        name: text,
        stopped: lenientBool,
        stopped_at: optionalText.catch(null),
        felt: text,
        would_finish: lenientBool,
        action: personaAction,
        scroll_away_trigger: text,
        quote: text,
      }),
    )
    .min(1, "at least one persona reaction is required"),
  scores: z.object(
    Object.fromEntries(SCORE_CATEGORIES.map((c) => [c, scoreEntry])) as Record<ScoreCategory, typeof scoreEntry>,
  ),
  conversion_chain: z
    .array(z.object({ step: text, status: chainStatus, note: text }))
    .catch([]),
  break_point: optionalText.catch(null),
  prediction: z.object({
    tier: tierSchema,
    confidence: confidenceSchema,
    outcome: outcomeSchema.optional(),
    summary: text.optional(),
    similar_posts: z.array(text).catch([]).optional(),
  }),
  alternative_hooks: z
    .array(text)
    .transform((hooks) => hooks.map((h) => h.trim()).filter(Boolean))
    .pipe(z.array(z.string()).min(1, "at least one alternative hook is required").max(10)),
  rewritten_section: z
    .object({ section: text, original: text, rewrite: text, why: text })
    .nullable()
    .catch(null)
    .optional(),
  improved_cta: text.optional(),
  // App add-on (prompts/full-rewrite.md). Optional: older reviews and imperfect replies simply lack it.
  full_rewrite: z
    .object({
      hook: text,
      script: text,
      on_screen_text: text.optional(),
      changes: z
        .preprocess((v) => (typeof v === "string" ? [v] : v), z.array(text))
        .transform((items) => items.map((i) => i.trim()).filter(Boolean))
        .catch([]),
    })
    .nullable()
    .catch(null)
    .optional(),
});

// ---- stable shape the UI uses -------------------------------------------------

export type ReviewView = {
  firstImpression: {
    strangerThinks: string;
    promiseOrTension: string;
    stopsScroll: boolean;
    devices: string[];
    verdict: string;
  };
  personas: {
    name: string;
    stopped: boolean;
    stoppedAt: string | null;
    felt: string;
    wouldFinish: boolean;
    action: PersonaAction;
    scrollAwayTrigger: string;
    quote: string;
  }[];
  scores: Record<ScoreCategory, { score: number; evidence: string }>;
  conversionChain: { step: string; status: ChainStatus; note: string }[];
  breakPoint: string | null;
  prediction: {
    tier: Tier;
    confidence: Confidence;
    outcome: Outcome | null;
    summary: string;
    similarPosts: string[];
  };
  alternativeHooks: string[];
  rewrittenSection: { section: string; original: string; rewrite: string; why: string } | null;
  improvedCta: string;
  /** Missing on reviews saved before the full-rewrite add-on. */
  fullRewrite?: { hook: string; script: string; onScreenText: string; changes: string[] } | null;
};

export const reviewSchema = rawReviewSchema.transform((r): ReviewView => {
  const fi = r.first_impression ?? {};
  return {
    firstImpression: {
      strangerThinks: fi.stranger_thinks ?? "",
      promiseOrTension: fi.promise_or_tension ?? "",
      stopsScroll: fi.stops_scroll ?? false,
      devices: (fi.devices ?? []).filter(Boolean),
      verdict: fi.verdict ?? "",
    },
    personas: r.personas.map((p) => ({
      name: p.name || "Persona",
      stopped: p.stopped,
      stoppedAt: p.stopped_at,
      felt: p.felt,
      wouldFinish: p.would_finish,
      action: p.action,
      scrollAwayTrigger: p.scroll_away_trigger,
      quote: p.quote,
    })),
    scores: r.scores,
    conversionChain: r.conversion_chain.filter((s) => s.step),
    breakPoint: r.break_point,
    prediction: {
      tier: r.prediction.tier,
      confidence: r.prediction.confidence,
      outcome: r.prediction.outcome ?? null,
      summary: r.prediction.summary ?? "",
      similarPosts: (r.prediction.similar_posts ?? []).filter(Boolean),
    },
    alternativeHooks: r.alternative_hooks,
    rewrittenSection:
      r.rewritten_section && (r.rewritten_section.rewrite || r.rewritten_section.original)
        ? r.rewritten_section
        : null,
    improvedCta: r.improved_cta ?? "",
    fullRewrite:
      r.full_rewrite && r.full_rewrite.script.trim()
        ? {
            hook: r.full_rewrite.hook.trim(),
            script: r.full_rewrite.script.trim(),
            onScreenText: (r.full_rewrite.on_screen_text ?? "").trim(),
            changes: r.full_rewrite.changes,
          }
        : null,
  };
});

/** Short, human-readable list of what was wrong (sent back to the model on retry). */
export function describeIssues(error: z.ZodError, maxLength = 500): string {
  const lines = error.issues.map((issue) => {
    const path = issue.path.length ? issue.path.join(".") : "(root)";
    return `${path}: ${issue.message}`;
  });
  const joined = lines.join("; ");
  return joined.length > maxLength ? `${joined.slice(0, maxLength - 1)}…` : joined;
}
