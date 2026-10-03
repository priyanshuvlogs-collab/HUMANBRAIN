import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "../database.types";
import { supabaseEnv } from "./env";

/** Supabase client for Client Components (runs in the browser). */
export function createClient() {
  const { url, key } = supabaseEnv();
  return createBrowserClient<Database>(url, key);
}
