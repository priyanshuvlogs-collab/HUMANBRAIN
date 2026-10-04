import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "../database.types";
import { hasSupabaseEnv, supabaseEnv } from "./env";

const PUBLIC_PATHS = ["/login"];

/**
 * Runs before every page/API request (from src/proxy.ts):
 * refreshes the Supabase session cookie, then sends signed-out visitors to /login
 * (or answers API calls with a JSON 401 instead of an HTML redirect).
 */
export async function updateSession(request: NextRequest) {
  // Supabase settings missing (first deploy): show the setup checklist instead of crashing.
  if (!hasSupabaseEnv()) {
    const path = request.nextUrl.pathname;
    if (path === "/setup") return NextResponse.next({ request });
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "Offer Brain isn't set up yet. Open /setup for the steps." }, { status: 503 });
    }
    const setupUrl = request.nextUrl.clone();
    setupUrl.pathname = "/setup";
    setupUrl.search = "";
    return NextResponse.redirect(setupUrl);
  }

  let response = NextResponse.next({ request });
  const { url, key } = supabaseEnv();

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        // Stops CDNs from caching responses that set auth cookies.
        Object.entries(headers).forEach(([header, value]) => response.headers.set(header, value));
      },
    },
  });

  // Do not put code between createServerClient and getClaims(): it refreshes the session.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  if (!signedIn && !isPublic) {
    // Server Action calls check the session themselves and return "You're signed out";
    // redirecting them to /login would only show a confusing generic error.
    if (request.headers.has("next-action")) return response;
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "You're signed out. Please log in again." }, { status: 401 });
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  return response;
}
