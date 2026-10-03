import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessage, BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { SAMPLE_REVIEW_REPLY } from "./fixtures/sample-review";
import { parseReviewReply, stripJsonBlock } from "./parse";
import type { ReviewView } from "./schema";

/** Error with a message that is safe and friendly to show in the UI. */
export class ReviewError extends Error {
  constructor(
    public readonly userMessage: string,
    public readonly status = 502,
    options?: { cause?: unknown },
  ) {
    super(userMessage, options);
    this.name = "ReviewError";
  }
}

/** The parts of a Claude response we use. */
export type ClaudeReply = Pick<BetaMessage, "content" | "stop_reason" | "stop_details" | "model" | "usage">;
export type ClaudeCaller = (args: {
  system: string;
  messages: BetaMessageParam[];
  signal: AbortSignal;
}) => Promise<ClaudeReply>;

export type ReviewUsage = {
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
};

export type ReviewRunResult = {
  review: ReviewView;
  rawResponse: string;
  model: string;
  usage: ReviewUsage;
  retried: boolean;
};

// Vercel stops the function at 300s. Keep the whole review (first call + retry) under ~270s
// so we can always answer the browser with a friendly message.
export const TOTAL_BUDGET_MS = 270_000;
// Don't start the JSON retry unless there's at least this much time left.
export const MIN_RETRY_MS = 60_000;
// Thinking tokens count toward this limit and can't be switched off on current models,
// so leave plenty of room (we stream, and the time budget above still caps wall-clock time).
const MAX_TOKENS = 64_000;

// Models that accept server-side refusal fallback ("fallbacks: 'default'").
const FALLBACK_MODELS = new Set([
  "claude-sonnet-5-5",
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-fable-5-1",
  "claude-fable-5",
]);
const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
type Effort = (typeof EFFORTS)[number];

export function getModel(): string {
  return process.env.CLAUDE_MODEL?.trim() || "claude-sonnet-5-5";
}

/** CLAUDE_EFFORT: low | medium (default) | high | xhigh | max | off (= use the model's own default). */
export function getEffort(): Effort | null {
  const value = process.env.CLAUDE_EFFORT?.trim().toLowerCase();
  if (value === "off") return null;
  return (EFFORTS as readonly string[]).includes(value ?? "") ? (value as Effort) : "medium";
}

/** Mock mode returns a recorded reply instead of calling Claude. Never allowed on Vercel deployments. */
export function isMockMode(): boolean {
  return process.env.OFFER_BRAIN_MOCK_AI === "true" && !process.env.VERCEL;
}

let client: Anthropic | null = null;

const realCaller: ClaudeCaller = async ({ system, messages, signal }) => {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    throw new ReviewError("ANTHROPIC_API_KEY is not set. Add it to .env.local (or your Vercel settings).", 500);
  }
  client ??= new Anthropic({ maxRetries: 2 });
  const model = getModel();
  const effort = getEffort();
  // Streaming + finalMessage() avoids HTTP timeouts on long replies; we still wait for the full message.
  const stream = client.beta.messages.stream(
    {
      model,
      max_tokens: MAX_TOKENS,
      // The brain is long and identical for a retry or a re-review a few minutes later,
      // so cache it (cache reads cost 10% of normal input).
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages,
      ...(effort ? { output_config: { effort } } : {}),
      // If the model declines, let the API re-run it on Anthropic's recommended fallback model.
      ...(FALLBACK_MODELS.has(model)
        ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
        : {}),
    },
    { signal },
  );
  return stream.finalMessage();
};

const mockCaller: ClaudeCaller = async () => {
  await new Promise((resolve) => setTimeout(resolve, 1500));
  return {
    content: [{ type: "text", text: SAMPLE_REVIEW_REPLY, citations: null }],
    stop_reason: "end_turn",
    stop_details: null,
    model: "mock (recorded reply)",
    usage: { input_tokens: 0, output_tokens: 0 } as ClaudeReply["usage"],
  };
};

export function defaultCaller(): ClaudeCaller {
  return isMockMode() ? mockCaller : realCaller;
}

function textOf(reply: ClaudeReply): string {
  return reply.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("")
    .trim();
}

function assertNotRefused(reply: ClaudeReply) {
  if (reply.stop_reason !== "refusal") return;
  const category = reply.stop_details?.category;
  const reason = category ? ` (flagged as ${category.replaceAll("_", " ")})` : "";
  throw new ReviewError(
    `Claude declined to review this post${reason}. Try rewording the content and run it again.`,
    422,
  );
}

function addUsage(total: ReviewUsage, reply: ClaudeReply) {
  total.calls += 1;
  total.input_tokens += reply.usage?.input_tokens ?? 0;
  total.output_tokens += reply.usage?.output_tokens ?? 0;
  total.cache_read_input_tokens += reply.usage?.cache_read_input_tokens ?? 0;
  total.cache_creation_input_tokens += reply.usage?.cache_creation_input_tokens ?? 0;
}

/**
 * Runs one review: call Claude → parse the JSON block → if it's missing/invalid,
 * retry ONCE asking for the corrected JSON only.
 */
export async function runReview(input: {
  system: string;
  userMessage: string;
  call?: ClaudeCaller;
  now?: () => number;
  budgetMs?: number;
}): Promise<ReviewRunResult> {
  const call = input.call ?? defaultCaller();
  const now = input.now ?? Date.now;
  const deadline = now() + (input.budgetMs ?? TOTAL_BUDGET_MS);
  const usage: ReviewUsage = {
    calls: 0,
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  };

  const callWithinDeadline = async (messages: BetaMessageParam[]) => {
    const remaining = deadline - now();
    try {
      const reply = await call({ system: input.system, messages, signal: AbortSignal.timeout(Math.max(1, remaining)) });
      addUsage(usage, reply);
      return reply;
    } catch (err) {
      throw toReviewError(err);
    }
  };

  const userTurn: BetaMessageParam = { role: "user", content: input.userMessage };

  const first = await callWithinDeadline([userTurn]);
  assertNotRefused(first);
  const firstText = textOf(first);
  if (!firstText && first.stop_reason === "max_tokens") {
    // Asking the same question again would just burn the same budget.
    throw new ReviewError(
      "Claude used its whole answer budget on thinking. Set CLAUDE_EFFORT to a lower level (e.g. medium or low) and try again.",
      502,
    );
  }
  const firstParse = parseReviewReply(firstText);
  if (firstParse.ok) {
    return { review: firstParse.review, rawResponse: firstText, model: first.model, usage, retried: false };
  }

  if (deadline - now() < MIN_RETRY_MS) {
    throw new ReviewError(
      "Claude's reply couldn't be read and there wasn't time to retry. Please run the review again.",
      502,
    );
  }

  // An empty assistant turn is rejected by the API, so if the first reply had no text
  // (and wasn't cut off), simply ask the original question again.
  const retryMessages: BetaMessageParam[] = firstText
    ? [
        userTurn,
        { role: "assistant", content: firstText },
        {
          role: "user",
          content: `Your JSON block was missing or invalid: ${firstParse.problem}\nReply with ONLY the corrected \`\`\`json block, nothing else.`,
        },
      ]
    : [userTurn];

  const second = await callWithinDeadline(retryMessages);
  assertNotRefused(second);
  const secondText = textOf(second);
  const secondParse = parseReviewReply(secondText);
  if (!secondParse.ok) {
    console.error("[review] JSON still invalid after retry:", secondParse.problem);
    throw new ReviewError("Claude's reply couldn't be read, even after a retry. Please run the review again.", 502);
  }

  const rawResponse = firstText ? `${stripJsonBlock(firstText)}\n\n${secondText}`.trim() : secondText;
  return { review: secondParse.review, rawResponse, model: second.model, usage, retried: true };
}

/** The API error type, e.g. "overloaded_error" (mid-stream errors carry it on `type`, others in the body). */
function errorType(err: InstanceType<typeof Anthropic.APIError>): string | null {
  const body = err.error as { type?: string; error?: { type?: string } } | undefined;
  return err.type ?? body?.error?.type ?? body?.type ?? null;
}

/** Maps SDK/network errors to friendly messages. Order matters: subclasses first. */
export function toReviewError(err: unknown): ReviewError {
  if (err instanceof ReviewError) return err;
  const log = (label: string) => console.error(`[review] ${label}:`, err);

  const isAbort =
    err instanceof Anthropic.APIUserAbortError ||
    err instanceof Anthropic.APIConnectionTimeoutError ||
    (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError"));
  if (isAbort) {
    log("timeout");
    return new ReviewError("The review took too long and was stopped. Please try again.", 504, { cause: err });
  }
  if (err instanceof Anthropic.APIConnectionError) {
    log("connection");
    return new ReviewError("Couldn't reach Claude (network problem). Please try again.", 502, { cause: err });
  }
  if (err instanceof Anthropic.APIError) {
    log(`api ${err.status ?? ""} ${errorType(err) ?? ""}`);
    const status = err.status;
    const message = err.message ?? "";
    if (status === 401) return new ReviewError("Your Anthropic API key is invalid. Check ANTHROPIC_API_KEY.", 500, { cause: err });
    if (status === 402 || (status === 400 && /credit|billing|spend/i.test(message))) {
      return new ReviewError("Your Anthropic account is out of credit or hit its spend limit. Check billing in the Claude Console.", 502, { cause: err });
    }
    if (status === 403) return new ReviewError("Your Anthropic API key doesn't have access to this model.", 500, { cause: err });
    if (status === 404) return new ReviewError("Model not found. Check the CLAUDE_MODEL setting.", 500, { cause: err });
    if (status === 429) return new ReviewError("Claude is busy right now (rate limit). Wait a minute and try again.", 429, { cause: err });
    if (errorType(err) === "overloaded_error" || status === 529) {
      return new ReviewError("Claude is overloaded right now. Please try again in a minute.", 503, { cause: err });
    }
    if (status === 400) return new ReviewError("Claude rejected the request. Check the CLAUDE_MODEL and CLAUDE_EFFORT settings.", 500, { cause: err });
    return new ReviewError("Claude had a problem on their side. Please try again.", 502, { cause: err });
  }
  log("unexpected");
  return new ReviewError("Something went wrong while talking to Claude. Please try again.", 500, { cause: err });
}
