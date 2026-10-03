import { describeIssues, reviewSchema, type ReviewView } from "./schema";

export type ParseResult =
  | { ok: true; review: ReviewView }
  | { ok: false; problem: string };

/**
 * Possible JSON objects in the model's reply, best guess first:
 * the LAST ```json fenced block (the brain asks for it at the end), then the last
 * balanced {...} object — which still works when a string inside the JSON contains ```.
 */
export function jsonCandidates(reply: string): string[] {
  const fenced = [...reply.matchAll(/```(?:json|JSON)?[ \t]*\r?\n([\s\S]*?)```/g)]
    .map((m) => m[1].trim())
    .filter((block) => block.startsWith("{"));
  const candidates = [fenced.at(-1), lastBalancedObject(reply)].filter((c): c is string => Boolean(c));
  return [...new Set(candidates)];
}

/** The most likely JSON text in the reply (or null). */
export function extractJsonText(reply: string): string | null {
  return jsonCandidates(reply)[0] ?? null;
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
  const candidates = jsonCandidates(reply);
  if (candidates.length === 0) return { ok: false, problem: "No JSON block was found at the end of the reply." };

  let data: unknown;
  let parseError = "";
  for (const candidate of candidates) {
    try {
      data = JSON.parse(candidate);
      parseError = "";
      break;
    } catch (err) {
      parseError ||= err instanceof Error ? err.message : "invalid JSON";
    }
  }
  if (parseError) return { ok: false, problem: `The JSON block is not valid JSON (${parseError}).` };

  const result = reviewSchema.safeParse(data);
  if (!result.success) return { ok: false, problem: describeIssues(result.error) };
  return { ok: true, review: result.data };
}

/** The reply without its trailing JSON block — the human-readable analysis. */
export function stripJsonBlock(reply: string): string {
  const idx = reply.lastIndexOf("```json");
  return (idx >= 0 ? reply.slice(0, idx) : reply).trim();
}
