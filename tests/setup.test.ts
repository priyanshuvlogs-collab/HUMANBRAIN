import { afterEach, describe, expect, it, vi } from "vitest";
import { hasSupabaseEnv } from "@/lib/supabase/env";

describe("hasSupabaseEnv", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is true only when both Supabase settings are present", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_x");
    expect(hasSupabaseEnv()).toBe(true);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    expect(hasSupabaseEnv()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_x");
    expect(hasSupabaseEnv()).toBe(false);
  });
});
