import { NextResponse } from "next/server";
import * as z from "zod";
import { getCurrentUser } from "@/lib/auth";
import { ExtractError, extractFromLink } from "@/lib/link-extract";

// Fetching a page (and a YouTube transcript) normally takes a few seconds.
export const maxDuration = 30;

const body = z.object({ url: z.string().trim().min(1, "Paste a link first.").max(2000, "That link is too long.") });

/** POST { url } → the review form's fields, filled from the linked post or page. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You're signed out. Please log in again." }, { status: 401 });

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });

  try {
    return NextResponse.json(await extractFromLink(parsed.data.url));
  } catch (err) {
    const message = err instanceof ExtractError ? err.message : "Couldn't read that link. Paste the text instead.";
    if (!(err instanceof ExtractError)) console.error("[extract] unexpected error:", err);
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
