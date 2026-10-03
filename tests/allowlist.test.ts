import { afterEach, describe, expect, it, vi } from "vitest";
import { isEmailAllowed } from "@/lib/allowlist";

describe("ALLOWED_EMAILS", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("allows only listed emails (case and spaces don't matter)", () => {
    vi.stubEnv("ALLOWED_EMAILS", " Founder@Example.com , other@example.com");
    expect(isEmailAllowed("founder@example.com")).toBe(true);
    expect(isEmailAllowed("OTHER@example.com ")).toBe(true);
    expect(isEmailAllowed("stranger@example.com")).toBe(false);
    expect(isEmailAllowed(null)).toBe(false);
  });

  it("empty list: open locally, closed on every Vercel deployment", () => {
    vi.stubEnv("ALLOWED_EMAILS", "");
    vi.stubEnv("VERCEL", "");
    expect(isEmailAllowed("anyone@example.com")).toBe(true);
    vi.stubEnv("VERCEL", "1");
    expect(isEmailAllowed("anyone@example.com")).toBe(false);
  });
});
