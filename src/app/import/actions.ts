"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import { IMPORT_BATCH_ROWS, duplicateKey, validateCsvRow, type ImportRow } from "@/lib/csv";
import { computePerformanceIndex } from "@/lib/performance";
import { toNumberRecord } from "@/lib/results";

export type ImportBatchResult =
  | { ok: true; imported: number; duplicates: number; failed: { line: number; errors: string[] }[] }
  | { ok: false; error: string };

type IncomingRow = { line: number; data: Record<string, unknown> };

/**
 * Saves one batch of CSV rows as posted posts (source "csv") with a results row each.
 * Every row is re-checked here — the browser preview is only a convenience.
 */
export async function importRows(incoming: IncomingRow[]): Promise<ImportBatchResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You're signed out. Please log in again." };
  const { supabase, userId } = user;
  if (!Array.isArray(incoming) || incoming.length === 0) return { ok: true, imported: 0, duplicates: 0, failed: [] };
  if (incoming.length > IMPORT_BATCH_ROWS) return { ok: false, error: "Too many rows in one batch." };

  const failed: { line: number; errors: string[] }[] = [];
  const valid: { line: number; row: ImportRow }[] = [];
  for (const item of incoming) {
    const data = item && typeof item.data === "object" && item.data ? item.data : {};
    const check = validateCsvRow(data, Number(item?.line) || 0);
    if (check.ok) valid.push({ line: check.line, row: check.row });
    else failed.push({ line: check.line, errors: check.errors });
  }

  // Skip posts that already exist (same platform, hook and posted day) — e.g. importing the same file twice.
  const seen = new Set<string>();
  if (valid.length) {
    const existing = await loadPossibleDuplicates(user.supabase, userId, valid.map((v) => v.row));
    if (!existing) return { ok: false, error: "Couldn't check for duplicates. Please try again." };
    for (const post of existing) seen.add(duplicateKey(post));
  }
  let duplicates = 0;
  const fresh = valid.filter(({ row }) => {
    const k = duplicateKey(row);
    if (seen.has(k)) {
      duplicates++;
      return false;
    }
    seen.add(k);
    return true;
  });
  if (fresh.length === 0) return { ok: true, imported: 0, duplicates, failed };

  const { data: averagesRows } = await supabase.from("platform_averages").select("*").eq("user_id", userId);
  const averages = new Map((averagesRows ?? []).map((a) => [a.platform, toNumberRecord(a)]));

  const now = new Date().toISOString();
  const withIds = fresh.map(({ row }) => ({ id: crypto.randomUUID(), row }));
  const { error: postsError } = await supabase.from("posts").insert(
    withIds.map(({ id, row }) => ({
      id,
      user_id: userId,
      platform: row.platform,
      format: row.format,
      goal: row.goal,
      hook: row.hook,
      script: row.script,
      on_screen_text: row.on_screen_text,
      status: "posted",
      posted_at: row.posted_at,
      source: "csv",
    })),
  );
  if (postsError) {
    console.error("[import] posts insert failed:", postsError);
    return { ok: false, error: "Couldn't save these posts. Please try again." };
  }

  const { error: resultsError } = await supabase.from("results").insert(
    withIds.map(({ id, row }) => ({
      user_id: userId,
      post_id: id,
      ...row.metrics,
      performance_index: computePerformanceIndex(row.goal, row.metrics, averages.get(row.platform) ?? null),
      collected_at: now,
      source: "csv",
    })),
  );
  if (resultsError) {
    console.error("[import] results insert failed:", resultsError);
    // Don't leave posts without their numbers behind.
    await supabase.from("posts").delete().in("id", withIds.map((w) => w.id));
    return { ok: false, error: "Couldn't save the results for these posts. Please try again." };
  }

  revalidatePath("/posts");
  return { ok: true, imported: withIds.length, duplicates, failed };
}

const PAGE = 1000; // Supabase returns at most 1,000 rows per request

/** Existing posts on the same platforms posted in the batch's date range (or with no date). Null on error. */
async function loadPossibleDuplicates(supabase: CurrentUser["supabase"], userId: string, rows: ImportRow[]) {
  const platforms = [...new Set(rows.map((r) => r.platform))];
  const days = rows.flatMap((r) => (r.posted_at ? [r.posted_at.slice(0, 10)] : [])).sort();
  const dateFilter = days.length
    ? `posted_at.is.null,and(posted_at.gte."${days[0]}T00:00:00Z",posted_at.lte."${days[days.length - 1]}T23:59:59.999Z")`
    : "posted_at.is.null";
  const found: { platform: string; hook: string; posted_at: string | null }[] = [];
  for (let from = 0; from < 50 * PAGE; from += PAGE) {
    const { data, error } = await supabase
      .from("posts")
      .select("platform, hook, posted_at")
      .eq("user_id", userId)
      .in("platform", platforms)
      .or(dateFilter)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) {
      console.error("[import] duplicate check failed:", error);
      return null;
    }
    found.push(...data);
    if (data.length < PAGE) break;
  }
  return found;
}
