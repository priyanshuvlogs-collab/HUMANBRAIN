"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import {
  DEFAULT_IMPORT_OPTIONS,
  IMPORT_BATCH_ROWS,
  addToDuplicateIndex,
  isDuplicate,
  validateCsvRow,
  type DuplicateIndex,
  type ImportOptions,
  type ImportRow,
} from "@/lib/csv";
import { computePerformanceIndex } from "@/lib/performance";
import { toNumberRecord } from "@/lib/results";

export type ImportBatchResult =
  | { ok: true; imported: number; duplicates: number; failed: { line: number; errors: string[] }[] }
  | { ok: false; error: string };

type IncomingRow = { line: number; data: Record<string, unknown> };

function cleanOptions(input: unknown): ImportOptions {
  const o = (input ?? {}) as Partial<ImportOptions>;
  return {
    dateOrder: o.dateOrder === "dmy" ? "dmy" : DEFAULT_IMPORT_OPTIONS.dateOrder,
    decimalComma: o.decimalComma === true,
  };
}

/**
 * Saves one batch of CSV rows as posted posts (source "csv") with a results row each.
 * Every row is re-checked here — the browser preview is only a convenience. Posts and
 * results are written together by one database function, so a batch is all-or-nothing.
 */
export async function importRows(incoming: IncomingRow[], rawOptions?: ImportOptions): Promise<ImportBatchResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You're signed out. Please log in again." };
  const { supabase, userId } = user;
  if (!Array.isArray(incoming) || incoming.length === 0) return { ok: true, imported: 0, duplicates: 0, failed: [] };
  if (incoming.length > IMPORT_BATCH_ROWS) return { ok: false, error: "Too many rows in one batch." };
  const options = cleanOptions(rawOptions);

  const failed: { line: number; errors: string[] }[] = [];
  const valid: ImportRow[] = [];
  for (const item of incoming) {
    const data = item && typeof item.data === "object" && item.data ? item.data : {};
    const check = validateCsvRow(data, Number(item?.line) || 0, options);
    if (check.ok) valid.push(check.row);
    else failed.push({ line: check.line, errors: check.errors });
  }

  // Skip posts that are already in Offer Brain — e.g. importing the same file twice.
  const index = valid.length ? await loadDuplicateIndex(supabase, userId, valid) : new Map();
  if (!index) return { ok: false, error: "Couldn't check for duplicates. Please try again." };
  let duplicates = 0;
  const fresh = valid.filter((row) => {
    if (isDuplicate(index, row)) {
      duplicates++;
      return false;
    }
    addToDuplicateIndex(index, row);
    return true;
  });
  if (fresh.length === 0) return { ok: true, imported: 0, duplicates, failed };

  const { data: averagesRows } = await supabase.from("platform_averages").select("*").eq("user_id", userId);
  const averages = new Map((averagesRows ?? []).map((a) => [a.platform, toNumberRecord(a)]));

  const items = fresh.map((row) => ({
    id: crypto.randomUUID(),
    platform: row.platform,
    format: row.format,
    goal: row.goal,
    hook: row.hook,
    script: row.script,
    on_screen_text: row.on_screen_text,
    posted_at: row.posted_at,
    ...row.metrics,
    performance_index: computePerformanceIndex(row.goal, row.metrics, averages.get(row.platform) ?? null),
  }));
  const { data: imported, error } = await supabase.rpc("import_csv_batch", { items });
  if (error) {
    console.error("[import] batch insert failed:", error);
    return { ok: false, error: "Couldn't save these posts. Please try again." };
  }

  revalidatePath("/posts");
  return { ok: true, imported: imported ?? items.length, duplicates, failed };
}

const PAGE = 1000; // Supabase returns at most 1,000 rows per request

/** Existing posts on the batch's platforms (hook + posted day), for duplicate checks. Null on error. */
async function loadDuplicateIndex(
  supabase: CurrentUser["supabase"],
  userId: string,
  rows: ImportRow[],
): Promise<DuplicateIndex | null> {
  const platforms = [...new Set(rows.map((r) => r.platform))];
  const index: DuplicateIndex = new Map();
  for (let from = 0; from < 100 * PAGE; from += PAGE) {
    const { data, error } = await supabase
      .from("posts")
      .select("platform, hook, posted_at")
      .eq("user_id", userId)
      .in("platform", platforms)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) {
      console.error("[import] duplicate check failed:", error);
      return null;
    }
    for (const post of data) addToDuplicateIndex(index, post);
    if (data.length < PAGE) break;
  }
  return index;
}
