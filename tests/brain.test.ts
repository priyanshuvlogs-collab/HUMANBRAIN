import { describe, expect, it } from "vitest";
import { PLACEHOLDERS, buildSystemPrompt, loadBrainFiles, needsProvisionalFormat, type PlaceholderValues } from "@/lib/brain";
import { activePersonasContext, buildPlaceholderValues, offerContext } from "@/lib/context";

const values = (overrides: Partial<PlaceholderValues> = {}): PlaceholderValues => ({
  BRAND_CONTEXT: "Handle: @maya",
  OFFER_CONTEXT: "Course",
  AVERAGE_METRICS: "1,000 views",
  PROOF_LIBRARY: "Empty",
  CALIBRATION_NOTES: "None",
  ACTIVE_PERSONAS: "1. THE SKEPTIC",
  ...overrides,
});

describe("brain file", () => {
  it("contains all 6 placeholders the app fills", async () => {
    const { brain } = await loadBrainFiles();
    for (const key of PLACEHOLDERS) expect(brain).toContain(`{{${key}}}`);
  });

  it("fills every placeholder and leaves none behind", async () => {
    const files = await loadBrainFiles();
    const { prompt } = buildSystemPrompt(files, values());
    expect(prompt).not.toMatch(/\{\{[A-Z_]+\}\}/);
    expect(prompt).toContain("Creator and brand: Handle: @maya");
    expect(prompt).toContain("1. THE SKEPTIC");
  });

  it("inserts dollar signs literally ($&, $$, $997)", () => {
    const files = { brain: "Offer: {{OFFER_CONTEXT}} end", provisionalFormat: "" };
    const { prompt } = buildSystemPrompt(files, values({ OFFER_CONTEXT: "Pay $997 — $& $$ $' $`" }));
    expect(prompt).toBe("Offer: Pay $997 — $& $$ $' $` end");
  });

  it("never treats database text as a placeholder", () => {
    const files = { brain: "{{BRAND_CONTEXT}} | {{OFFER_CONTEXT}}", provisionalFormat: "" };
    const { prompt } = buildSystemPrompt(files, values({ BRAND_CONTEXT: "literally {{OFFER_CONTEXT}}" }));
    expect(prompt).toBe("literally {{OFFER_CONTEXT}} | Course");
  });

  it("throws on an unknown placeholder", () => {
    const files = { brain: "{{BRAND_CONTEXT}} {{SOMETHING_NEW}}", provisionalFormat: "" };
    expect(() => buildSystemPrompt(files, values())).toThrow(/SOMETHING_NEW/);
  });

  it("appends the provisional output format only while the brain has no json spec", () => {
    const provisionalFormat = "TEMP FORMAT ```json {} ```";
    const truncated = buildSystemPrompt({ brain: "Brain {{BRAND_CONTEXT}}", provisionalFormat }, values());
    expect(truncated.provisional).toBe(true);
    expect(truncated.prompt).toContain("TEMP FORMAT");

    const complete = buildSystemPrompt({ brain: "Brain {{BRAND_CONTEXT}}\n```json\n{}\n```", provisionalFormat }, values());
    expect(complete.provisional).toBe(false);
    expect(complete.prompt).not.toContain("TEMP FORMAT");
    expect(needsProvisionalFormat("no spec")).toBe(true);
  });

  it("brain version changes when the brain text changes", () => {
    const a = buildSystemPrompt({ brain: "A {{BRAND_CONTEXT}}", provisionalFormat: "" }, values()).version;
    const b = buildSystemPrompt({ brain: "B {{BRAND_CONTEXT}}", provisionalFormat: "" }, values()).version;
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe("context builders", () => {
  it("explains empty context instead of leaving it blank", () => {
    const v = buildPlaceholderValues({ platform: "instagram", brand: null, offer: null, averages: null, personas: [] });
    expect(v.BRAND_CONTEXT).toMatch(/Not set yet/);
    expect(v.OFFER_CONTEXT).toMatch(/No specific offer/);
    expect(v.AVERAGE_METRICS).toMatch(/None yet.*Instagram/);
    expect(v.PROOF_LIBRARY).toMatch(/Empty/);
    expect(v.CALIBRATION_NOTES).toMatch(/None yet/);
  });

  it("formats offers and personas", () => {
    expect(offerContext({ name: "Starter Kit", price: 997, cta_type: "dm_keyword", cta_destination: "PLAN" })).toBe(
      "Starter Kit — price $997. Call to action: DM keyword (PLAN).",
    );
    expect(activePersonasContext([{ name: "The Skeptic", description: "Burned before.", voice: "Blunt." }])).toBe(
      "1. THE SKEPTIC — Burned before. Voice: Blunt.",
    );
  });
});
