"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import type { ActionState } from "@/lib/action-state";
import { getCurrentUser } from "@/lib/auth";
import { PLATFORM_KEYS, type Platform } from "@/lib/constants";

const SIGNED_OUT: ActionState = { error: "You're signed out. Please log in again." };

// Empty input → null; otherwise a non-negative number.
const optionalNumber = (max?: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : typeof v === "string" ? Number(v.replace(/,/g, "")) : v),
    z
      .number({ error: "Use numbers only." })
      .min(0, "Can't be negative.")
      .max(max ?? Number.MAX_SAFE_INTEGER, max ? `Must be ${max} or less.` : "Too large.")
      .nullable(),
  );

const averagesSchema = z.object({
  avg_views: optionalNumber(),
  avg_hold_3s_pct: optionalNumber(100),
  avg_watch_pct: optionalNumber(100),
  avg_saves: optionalNumber(),
  avg_shares: optionalNumber(),
  avg_dms: optionalNumber(),
});

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
      return { error: `${labelFor(platform)} — ${String(issue.path[0]).replace("avg_", "").replaceAll("_", " ")}: ${issue.message}` };
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

  revalidatePath("/settings/brand");
  return { ok: "Saved." };
}

function labelFor(platform: Platform) {
  return { instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube Shorts" }[platform];
}
