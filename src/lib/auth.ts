import "server-only";
import { redirect } from "next/navigation";
import { isEmailAllowed } from "./allowlist";
import { hasSupabaseEnv } from "./supabase/env";
import { createClient } from "./supabase/server";

export type CurrentUser = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  email: string | null;
};

/**
 * The signed-in, allow-listed user — or null.
 * Every Server Action and route handler calls this (the proxy alone is not enough).
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (!hasSupabaseEnv()) return null; // not set up yet — the proxy shows /setup
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  const email = typeof claims.email === "string" ? claims.email : null;
  if (!isEmailAllowed(email)) return null;
  return { supabase, userId: claims.sub, email };
}

/** For pages and Server Actions: redirects to /login when signed out. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
