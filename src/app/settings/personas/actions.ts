"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import type { ActionState } from "@/lib/action-state";
import { getCurrentUser } from "@/lib/auth";
import { MAX_ACTIVE_PERSONAS } from "@/lib/constants";
import { PERSONA_LIMIT_MESSAGE, activeStateForNewPersona, canActivateAnother, isPersonaLimitError } from "@/lib/personas";

const SIGNED_OUT: ActionState = { error: "You're signed out. Please log in again." };

const personaSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, "Give the persona a name.").max(100, "Name is too long."),
  description: z.string().trim().max(1000, "Description is too long."),
  voice: z.string().trim().max(500, "Voice is too long."),
});

async function activeCount(user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) {
  const { count } = await user.supabase
    .from("personas")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.userId)
    .eq("active", true);
  return count ?? 0;
}

export async function savePersona(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return SIGNED_OUT;
  const parsed = personaSchema.safeParse({
    id: formData.get("id") || undefined,
    name: formData.get("name") ?? "",
    description: formData.get("description") ?? "",
    voice: formData.get("voice") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, ...fields } = parsed.data;

  if (id) {
    const { error } = await user.supabase.from("personas").update(fields).eq("id", id);
    if (error) {
      console.error("[settings] persona save failed:", error);
      return { error: "Couldn't save the persona. Please try again." };
    }
    revalidatePath("/settings/personas");
    return { ok: "Saved." };
  }

  // New persona: switched on only if there's room among the 10 active slots.
  const active = activeStateForNewPersona(await activeCount(user));
  const { data: last } = await user.supabase
    .from("personas")
    .select("sort_order")
    .eq("user_id", user.userId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await user.supabase
    .from("personas")
    .insert({ ...fields, user_id: user.userId, active, sort_order: (last?.sort_order ?? 0) + 1 });
  if (error) {
    console.error("[settings] persona add failed:", error);
    return { error: isPersonaLimitError(error) ? PERSONA_LIMIT_MESSAGE : "Couldn't add the persona. Please try again." };
  }
  revalidatePath("/settings/personas");
  return {
    ok: active
      ? "Persona added and switched on."
      : `Persona added, but switched off — you already have ${MAX_ACTIVE_PERSONAS} active.`,
  };
}

export async function setPersonaActive(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return SIGNED_OUT;
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Invalid persona." };
  const active = formData.get("active") === "true";

  if (active && !canActivateAnother(await activeCount(user))) return { error: PERSONA_LIMIT_MESSAGE };

  const { error } = await user.supabase.from("personas").update({ active }).eq("id", id.data);
  if (error) {
    // The database trigger is the final safety net (e.g. two tabs at once).
    if (isPersonaLimitError(error)) return { error: PERSONA_LIMIT_MESSAGE };
    console.error("[settings] persona toggle failed:", error);
    return { error: "Couldn't update the persona. Please try again." };
  }
  revalidatePath("/settings/personas");
  return { ok: active ? "Switched on." : "Switched off." };
}

export async function deletePersona(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return SIGNED_OUT;
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Invalid persona." };
  const { error } = await user.supabase.from("personas").delete().eq("id", id.data);
  if (error) {
    console.error("[settings] persona delete failed:", error);
    return { error: "Couldn't delete the persona. Please try again." };
  }
  revalidatePath("/settings/personas");
  return { ok: "Deleted." };
}
