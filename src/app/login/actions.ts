"use server";

import { redirect } from "next/navigation";
import * as z from "zod";
import { isEmailAllowed } from "@/lib/allowlist";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { step: "email" | "code"; email: string; error?: string; info?: string };

const emailSchema = z.email("Enter a valid email address.");
const codeSchema = z.string().trim().regex(/^\d{6,10}$/, "Enter the code from the email (numbers only).");

export async function sendCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = emailSchema.safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  if (!parsed.success) return { step: "email", email: "", error: parsed.error.issues[0].message };
  const email = parsed.data;

  if (!isEmailAllowed(email)) {
    return { step: "email", email, error: "This email isn't allowed to use this Offer Brain (see ALLOWED_EMAILS)." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) {
    console.error("[login] signInWithOtp failed:", error.status, error.code, error.message);
    const message =
      error.status === 429
        ? "Too many login emails. Wait a minute and try again."
        : "Couldn't send the login email. Check your Supabase email settings and try again.";
    return { step: "email", email, error: message };
  }
  return { step: "code", email, info: `We emailed a login code to ${email}.` };
}

export async function verifyCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const parsedCode = codeSchema.safeParse(formData.get("code") ?? "");
  if (!parsedCode.success) return { step: "code", email, error: parsedCode.error.issues[0].message };
  if (!isEmailAllowed(email)) return { step: "email", email, error: "This email isn't allowed to use this Offer Brain." };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token: parsedCode.data, type: "email" });
  if (error) {
    console.error("[login] verifyOtp failed:", error.status, error.code, error.message);
    return { step: "code", email, error: "That code is wrong or has expired. Try again or send a new code." };
  }
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
