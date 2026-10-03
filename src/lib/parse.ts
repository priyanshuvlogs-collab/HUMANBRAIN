import { describeIssues, reviewSchema, type ReviewView } from "./schema";

export type ParseResult =
  | { ok: true; review: ReviewView }
  | { ok: false; problem: string };

/**
 * Pull the JSON object out of the model's reply.
 * Prefers the LAST ```json fenced block (the brain asks for it at the end);
 * falls back to the last balanced {...} object in the text.
 */
export function extractJsonText(reply: string): string | null {
  const fenced = [...reply.matchAll(/```(?:json|JSON)?[ \t]*\r?\n([\s\S]*?)```/g)]
    .map((m) => m[1].trim())
    .filter((block) => block.startsWith("{"));
  if (fenced.length > 0) return fenced[fenced.length - 1];
  return lastBalancedObject(reply);
}

/** Finds the last top-level {...} in the text, respecting strings and escapes. */
function lastBalancedObject(text: string): string | null {
  let last: string | null = null;
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"' && depth > 0) inString = true;
    else if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}" && depth > 0) {
      depth--;
      if (depth === 0) last = text.slice(start, i + 1);
    }
  }
  return last;
}

/** Extract → JSON.parse → zod. Returns a problem description suitable for the retry prompt. */
export function parseReviewReply(reply: string): ParseResult {
  const jsonText = extractJsonText(reply);
  if (!jsonText) return { ok: false, problem: "No JSON block was found at the end of the reply." };

  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "invalid JSON";
    return { ok: false, problem: `The JSON block is not valid JSON (${detail}).` };
  }

  const result = reviewSchema.safeParse(data);
  if (!result.success) return { ok: false, problem: describeIssues(result.error) };
  return { ok: true, review: result.data };
}

/** The reply without its trailing JSON block — the human-readable analysis. */
export function stripJsonBlock(reply: string): string {
  const idx = reply.lastIndexOf("```json");
  return (idx >= 0 ? reply.slice(0, idx) : reply).trim();
}
