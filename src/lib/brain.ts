import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const PLACEHOLDERS = [
  "BRAND_CONTEXT",
  "OFFER_CONTEXT",
  "AVERAGE_METRICS",
  "PROOF_LIBRARY",
  "CALIBRATION_NOTES",
  "ACTIVE_PERSONAS",
] as const;
export type Placeholder = (typeof PLACEHOLDERS)[number];
export type PlaceholderValues = Record<Placeholder, string>;

export type BrainFiles = { brain: string; provisionalFormat: string };

const PROMPTS_DIR = path.join(process.cwd(), "prompts");
let cached: BrainFiles | null = null;

/**
 * Loads prompts/offer-brain-system.md (and the temporary output-format add-on).
 * Cached in production; re-read on every request in development so edits show up immediately.
 */
export async function loadBrainFiles(): Promise<BrainFiles> {
  if (cached && process.env.NODE_ENV === "production") return cached;
  const [brain, provisionalFormat] = await Promise.all([
    readFile(path.join(PROMPTS_DIR, "offer-brain-system.md"), "utf8"),
    readFile(path.join(PROMPTS_DIR, "provisional-output-format.md"), "utf8").catch(() => ""),
  ]);
  cached = { brain, provisionalFormat };
  return cached;
}

const promptCache = new Map<string, string>();

/** Loads another prompt file from prompts/ (e.g. learning-mode.md). Cached in production only. */
export async function loadPromptFile(name: string): Promise<string> {
  const hit = promptCache.get(name);
  if (hit !== undefined && process.env.NODE_ENV === "production") return hit;
  const text = await readFile(path.join(PROMPTS_DIR, name), "utf8");
  promptCache.set(name, text);
  return text;
}

/** True while the brain file has no JSON output spec of its own (it was received truncated). */
export function needsProvisionalFormat(brain: string): boolean {
  return !/```json/i.test(brain);
}

/** Short fingerprint of the brain text, stored with each review. */
export function brainVersion(brain: string): string {
  return createHash("sha256").update(brain).digest("hex").slice(0, 12);
}

/**
 * Fills every {{PLACEHOLDER}} with text from the database.
 * Uses a replacer function so "$" in values (prices like "$997", "$$") is inserted literally.
 * Throws on an unknown {{...}} placeholder, so a broken prompt never reaches Claude.
 */
export function buildSystemPrompt(files: BrainFiles, values: PlaceholderValues) {
  const unknown = [...files.brain.matchAll(/\{\{([A-Z_]+)\}\}/g)]
    .map((m) => m[1])
    .filter((key) => !PLACEHOLDERS.includes(key as Placeholder));
  if (unknown.length > 0) {
    throw new Error(`Brain file has unknown placeholders: ${[...new Set(unknown)].join(", ")}`);
  }

  // One pass, so text inserted from the database is never itself treated as a placeholder.
  let prompt = files.brain.replace(/\{\{([A-Z_]+)\}\}/g, (_match, key: Placeholder) => {
    return values[key].trim() || "None provided.";
  });

  const provisional = needsProvisionalFormat(files.brain) && files.provisionalFormat.trim() !== "";
  if (provisional) prompt = `${prompt.trimEnd()}\n\n${files.provisionalFormat.trim()}\n`;

  return { prompt, provisional, version: brainVersion(files.brain) };
}
