import { describe, expect, it } from "vitest";
import { buildSystemPrompt, PLACEHOLDERS } from "@/lib/brain";
import { postMessage } from "@/lib/context";
import { SAMPLE_REVIEW_REPLY } from "@/lib/fixtures/sample-review";
import { extractJsonText, parseReviewReply } from "@/lib/parse";

const sampleJson = () => JSON.parse(extractJsonText(SAMPLE_REVIEW_REPLY)!);
const fence = (o: unknown) => "Analysis.\n```json\n" + JSON.stringify(o) + "\n```";

describe("full rewrite in the review JSON", () => {
  it("parses the sample's full rewrite", () => {
    const r = parseReviewReply(SAMPLE_REVIEW_REPLY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.review.fullRewrite?.hook).toMatch(/^I was making \$0/);
    expect(r.review.fullRewrite?.script).toContain("\n\nI didn't post more.");
    expect(r.review.fullRewrite?.changes).toHaveLength(4);
  });

  it("is optional, and a broken one never fails the review", () => {
    const withoutIt = sampleJson();
    delete withoutIt.full_rewrite;
    const a = parseReviewReply(fence(withoutIt));
    expect(a.ok && a.review.fullRewrite).toBeNull();

    const broken = { ...sampleJson(), full_rewrite: "nope" };
    const b = parseReviewReply(fence(broken));
    expect(b.ok && b.review.fullRewrite).toBeNull();

    const loose = { ...sampleJson(), full_rewrite: { hook: " H ", script: " S ", changes: "one change" } };
    const c = parseReviewReply(fence(loose));
    expect(c.ok && c.review.fullRewrite).toEqual({ hook: "H", script: "S", onScreenText: "", changes: ["one change"] });
  });

  it("is dropped when the script is empty", () => {
    const empty = { ...sampleJson(), full_rewrite: { hook: "H", script: "  ", changes: [] } };
    const r = parseReviewReply(fence(empty));
    expect(r.ok && r.review.fullRewrite).toBeNull();
  });
});

describe("prompt add-on", () => {
  const values = Object.fromEntries(PLACEHOLDERS.map((p) => [p, "x"])) as Record<(typeof PLACEHOLDERS)[number], string>;

  it("appends the full-rewrite instructions after the brain (and the provisional format), without changing the brain", () => {
    const brain = "BRAIN {{BRAND_CONTEXT}}";
    const out = buildSystemPrompt({ brain, provisionalFormat: "PROVISIONAL", fullRewrite: "FULL REWRITE" }, values);
    expect(out.prompt).toBe("BRAIN x\n\nPROVISIONAL\n\nFULL REWRITE\n");
  });

  it("skips it when the file is missing", () => {
    expect(buildSystemPrompt({ brain: "B", provisionalFormat: "" }, values).prompt).toBe("B");
  });
});

describe("postMessage for websites", () => {
  it("labels a page as a page and explains how to read it", () => {
    const msg = postMessage({ platform: "website", format: "sales_page", goal: "sales", hook: "Headline", script: "Copy", onScreenText: "" }, "Kit");
    expect(msg).toMatch(/^PAGE TO REVIEW\nPlatform: Website\nFormat: Sales page/);
    expect(msg).toContain("each persona is a visitor");
    expect(msg).toContain("Headline (what a visitor sees first):\nHeadline");
    expect(msg).toContain("Page copy:\nCopy");
  });

  it("leaves social posts unchanged", () => {
    const msg = postMessage({ platform: "instagram", format: "reel", goal: "views", hook: "H", script: "", onScreenText: "" }, null);
    expect(msg).toMatch(/^POST TO REVIEW/);
    expect(msg).not.toContain("visitor");
  });
});
