"use server";

import { redirect } from "next/navigation";
import * as z from "zod";
import { isEmailAllowed } from "@/lib/allowlist";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { step: "email" | "code"; email: string; error?: string; info?: string };

const emailSchema = z.email("Enter a valid email address.");
const codeSchema = z.string().trim().regex(/^\d{6,10}$/, "Enter the code from the email (numbers only).");

/** One action for the whole login form; the hidden "intent" field says which button was used. */
export async function loginAction(prev: LoginState, formData: FormData): Promise<LoginState> {
  const intent = String(formData.get("intent") ?? "send");
  if (intent === "restart") return { step: "email", email: prev.email };
  if (intent === "verify") return verifyCode(formData);
  return sendCode(formData, intent === "resend");
}

async function sendCode(formData: FormData, resend: boolean): Promise<LoginState> {
  const typed = String(formData.get("email") ?? "").trim().toLowerCase();
  // When re-sending, stay on the code screen if anything fails (the first code may still work).
  const failStep = resend ? "code" : "email";

  const parsed = emailSchema.safeParse(typed);
  if (!parsed.success) return { step: "email", email: typed, error: parsed.error.issues[0].message };
  const email = parsed.data;

  if (!isEmailAllowed(email)) {
    return { step: "email", email, error: "This email isn't allowed to use this Offer Brain (see ALLOWED_EMAILS)." };
  }

  const supabase = await createClient();
  // shouldCreateUser: false — accounts are created in the Supabase dashboard, never from this page,
  // so nobody can claim an allowed email before its owner (see README "Create your account").
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (error) {
    console.error("[login] signInWithOtp failed:", error.status, error.code, error.message);
    let message = "Couldn't send the login email. Check your Supabase email settings and try again.";
    if (error.status === 429) message = "Too many login emails. Wait a minute and try again.";
    else if (error.code === "otp_disabled" || error.code === "signup_disabled" || /signups? not allowed/i.test(error.message)) {
      message = "There's no account for this email yet. Create it in Supabase first (Authentication → Users → Add user) — see the README.";
    }
    return { step: failStep, email, error: message };
  }
  return { step: "code", email, info: resend ? `New code sent to ${email}.` : `We emailed a login code to ${email}.` };
}

async function verifyCode(formData: FormData): Promise<LoginState> {
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
