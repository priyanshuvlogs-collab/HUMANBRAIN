"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import type { ActionState } from "@/lib/action-state";
import { getCurrentUser } from "@/lib/auth";
import { PLATFORM_KEYS, platformLabel } from "@/lib/constants";
import { averagesSchema, recomputePerformanceIndexes } from "@/lib/results";

const SIGNED_OUT: ActionState = { error: "You're signed out. Please log in again." };

const brandSchema = z.object({
  handle: z.string().trim().max(100, "Handle is too long."),
  niche: z.string().trim().max(300, "Niche is too long."),
  platforms: z.array(z.enum(PLATFORM_KEYS)),
});

export async function saveBrand(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return SIGNED_OUT;
  const { supabase, userId } = user;

  const brand = brandSchema.safeParse({
    handle: formData.get("handle") ?? "",
    niche: formData.get("niche") ?? "",
    platforms: formData.getAll("platforms"),
  });
  if (!brand.success) return { error: brand.error.issues[0].message };

  const averageRows = [];
  for (const platform of PLATFORM_KEYS) {
    const raw = Object.fromEntries(
      Object.keys(averagesSchema.shape).map((field) => [field, formData.get(`${platform}.${field}`) ?? ""]),
    );
    const parsed = averagesSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return { error: `${platformLabel(platform)} — ${issue.message}` };
    }
    averageRows.push({ user_id: userId, platform, ...parsed.data, updated_at: new Date().toISOString() });
  }

  const { error: brandError } = await supabase
    .from("brand_settings")
    .upsert({ user_id: userId, ...brand.data, updated_at: new Date().toISOString() });
  if (brandError) {
    console.error("[settings] brand save failed:", brandError);
    return { error: "Couldn't save your brand settings. Please try again." };
  }

  const { error: avgError } = await supabase
    .from("platform_averages")
    .upsert(averageRows, { onConflict: "user_id,platform" });
  if (avgError) {
    console.error("[settings] averages save failed:", avgError);
    return { error: "Couldn't save your averages. Please try again." };
  }

  // Performance Index is relative to your averages, so past results are re-scored.
  const rescored = await recomputePerformanceIndexes(supabase, userId, PLATFORM_KEYS);
  revalidatePath("/settings/brand");
  if (rescored > 0) revalidatePath("/posts", "layout");
  return { ok: rescored > 0 ? `Saved. Re-scored ${rescored} past result${rescored === 1 ? "" : "s"}.` : "Saved." };
}
