import { describe, expect, it } from "vitest";
import { averagesSchema, hasAnyMetric, metricsSchema, parseNumberInput, recomputePerformanceIndexes } from "@/lib/results";

describe("parseNumberInput", () => {
  it.each([
    ["12,000", 12000],
    ["62%", 62],
    ["$97", 97],
    [" 1 200 ", 1200],
    ["", null],
    ["-", null],
    ["N/A", null],
    ["1.2K", 1200],
    ["3m", 3000000],
    ["₹1,500", 1500],
    [null, null],
    [5, 5],
  ])("%j → %j", (input, expected) => {
    expect(parseNumberInput(input)).toBe(expected);
  });

  it("decimal-comma mode for European files", () => {
    expect(parseNumberInput("12.000", { decimalComma: true })).toBe(12000);
    expect(parseNumberInput("62,5", { decimalComma: true })).toBe(62.5);
    expect(parseNumberInput("1.234,5", { decimalComma: true })).toBe(1234.5);
  });

  it("garbage stays invalid", () => {
    expect(parseNumberInput("lots")).toBeNaN();
  });
});

describe("metricsSchema", () => {
  it("accepts blanks and formatted numbers", () => {
    const parsed = metricsSchema.parse({ views: "12,000", avg_watch_pct: "38%", likes: "" });
    expect(parsed).toMatchObject({ views: 12000, avg_watch_pct: 38, likes: null });
    expect(hasAnyMetric(parsed)).toBe(true);
    expect(hasAnyMetric(metricsSchema.parse({}))).toBe(false);
  });

  it("gives friendly messages for bad numbers", () => {
    const issues = (input: Record<string, string>) => {
      const r = metricsSchema.safeParse(input);
      return r.success ? [] : r.error.issues.map((i) => i.message);
    };
    expect(issues({ views: "lots" })).toEqual(["Views / reach: use numbers only."]);
    expect(issues({ saves: "-3" })).toEqual(["Saves can't be negative."]);
    expect(issues({ hold_3s_pct: "120" })).toEqual(["3-sec hold % must be 100 or less."]);
  });
});

describe("averagesSchema", () => {
  it("uses the avg_ column names", () => {
    expect(Object.keys(averagesSchema.shape)).toEqual([
      "avg_views",
      "avg_hold_3s_pct",
      "avg_watch_pct",
      "avg_likes",
      "avg_comments",
      "avg_saves",
      "avg_shares",
      "avg_dms",
      "avg_link_clicks",
      "avg_leads",
      "avg_sales",
    ]);
    const r = averagesSchema.safeParse({ avg_watch_pct: "140" });
    expect(r.success).toBe(false);
  });
});

/** A tiny stand-in for the Supabase query builder: enough for recomputePerformanceIndexes. */
function fakeSupabase(averages: Record<string, unknown>[], results: Record<string, unknown>[]) {
  const upserts: { rows: unknown[]; onConflict?: string }[] = [];
  const from = (table: string) => {
    const query = {
      select: () => query,
      eq: () => query,
      in: () => query,
      order: () => query,
      range: async (from: number, to: number) => ({ data: results.slice(from, to + 1), error: null }),
      then: (resolve: (v: unknown) => void) => resolve({ data: table === "platform_averages" ? averages : [], error: null }),
      upsert: async (rows: unknown[], options: { onConflict?: string }) => {
        upserts.push({ rows, onConflict: options.onConflict });
        return { error: null };
      },
    };
    return query;
  };
  return { client: { from }, upserts };
}

describe("recomputePerformanceIndexes", () => {
  it("re-scores results against new averages and only writes the ones that changed", async () => {
    const { client, upserts } = fakeSupabase(
      [{ platform: "instagram", avg_views: 1000, avg_watch_pct: "40" }],
      [
        // views goal: 2000/1000 = 2 (w .6), 40/40 = 1 (w .4) → 1.6 (unchanged)
        { id: "r1", user_id: "u", post_id: "p1", performance_index: "1.60", views: 2000, avg_watch_pct: 40, posts: { goal: "views", platform: "instagram" } },
        // was 1.00, now 500/1000 = 0.5 (only views usable)
        { id: "r2", user_id: "u", post_id: "p2", performance_index: "1.00", views: "500", avg_watch_pct: null, posts: { goal: "views", platform: "instagram" } },
        // no averages for TikTok → null
        { id: "r3", user_id: "u", post_id: "p3", performance_index: 2, views: 900, posts: { goal: "views", platform: "tiktok" } },
      ],
    );
    const changed = await recomputePerformanceIndexes(client, "u", ["instagram", "tiktok"]);
    expect(changed).toBe(2);
    expect(upserts).toEqual([
      {
        onConflict: "id",
        rows: [
          { id: "r2", user_id: "u", post_id: "p2", performance_index: 0.5 },
          { id: "r3", user_id: "u", post_id: "p3", performance_index: null },
        ],
      },
    ]);
  });

  it("does nothing for no platforms", async () => {
    const { client, upserts } = fakeSupabase([], []);
    expect(await recomputePerformanceIndexes(client, "u", [])).toBe(0);
    expect(upserts).toEqual([]);
  });
});
