"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import type { ActionState } from "@/lib/action-state";
import { getCurrentUser } from "@/lib/auth";
import { CTA_TYPE_KEYS } from "@/lib/constants";

const SIGNED_OUT: ActionState = { error: "You're signed out. Please log in again." };

const offerSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, "Give the offer a name.").max(200, "Name is too long."),
  price: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : typeof v === "string" ? Number(v.replace(/[$,\s]/g, "")) : v),
    z.number({ error: "Price must be a number." }).min(0, "Price can't be negative.").nullable(),
  ),
  cta_type: z.enum(CTA_TYPE_KEYS, { error: "Pick a CTA type." }),
  cta_destination: z.string().trim().max(500, "Destination is too long."),
});

export async function saveOffer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return SIGNED_OUT;

  const parsed = offerSchema.safeParse({
    id: formData.get("id") || undefined,
    name: formData.get("name") ?? "",
    price: formData.get("price") ?? "",
    cta_type: formData.get("cta_type"),
    cta_destination: formData.get("cta_destination") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, ...fields } = parsed.data;

  const { error } = id
    ? await user.supabase.from("offers").update(fields).eq("id", id)
    : await user.supabase.from("offers").insert({ ...fields, user_id: user.userId });
  if (error) {
    console.error("[settings] offer save failed:", error);
    return { error: "Couldn't save the offer. Please try again." };
  }
  revalidatePath("/settings/offers");
  return { ok: id ? "Saved." : "Offer added." };
}

export async function deleteOffer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return SIGNED_OUT;
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Invalid offer." };
  const { error } = await user.supabase.from("offers").delete().eq("id", id.data);
  if (error) {
    console.error("[settings] offer delete failed:", error);
    return { error: "Couldn't delete the offer. Please try again." };
  }
  revalidatePath("/settings/offers");
  return { ok: "Deleted." };
}
