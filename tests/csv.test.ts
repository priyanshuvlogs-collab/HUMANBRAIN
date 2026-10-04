import { describe, expect, it } from "vitest";
import {
  DEFAULT_IMPORT_OPTIONS,
  addToDuplicateIndex,
  checkHeaders,
  checkRecord,
  chunkRows,
  decodeCsvBytes,
  isDuplicate,
  normalizeHeader,
  parseCsvText,
  templateCsv,
  validateCsvRow,
  type DuplicateIndex,
  type RowCheck,
} from "@/lib/csv";

const NOW = new Date("2026-10-04T12:00:00Z");
const OPTS = DEFAULT_IMPORT_OPTIONS;
const errorsOf = (check: RowCheck) => (check.ok ? [] : check.errors);
const row = (overrides: Record<string, string> = {}) => ({
  platform: "instagram",
  format: "reel",
  goal: "leads",
  hook: "I made $3,000 with one DM keyword",
  script: "",
  on_screen_text: "",
  posted_at: "2026-09-14",
  views: "12,000",
  dms: "31",
  ...overrides,
});

describe("normalizeHeader", () => {
  it.each([
    ["Platform", "platform"],
    ["  Avg Watch %", "avg_watch_pct"],
    ["3-sec hold %", "hold_3s_pct"],
    ["hold_3s_pct", "hold_3s_pct"],
    ["Link Clicks", "link_clicks"],
    ["On-screen text", "on_screen_text"],
    ["Caption", "script"],
    ["Publish time", "posted_at"],
    ["Reach", "views"],
    ["Reach %", "reach_pct"],
    ["Date posted", "posted_at"],
    ["Posted date", "posted_at"],
    ["DMs", "dms"],
    ["﻿platform", "platform"],
    ["Something else", "something_else"],
  ])("%s → %s", (header, expected) => {
    expect(normalizeHeader(header)).toBe(expected);
  });
});

describe("checkHeaders", () => {
  it("accepts the template's columns", () => {
    expect(checkHeaders(parseCsvText(templateCsv()).headers)).toEqual({ errors: [], warnings: [], ignored: [] });
  });

  it("lists missing required columns and ignored extras (with the original names)", () => {
    const { errors, ignored } = checkHeaders(["hook", "My Notes"]);
    expect(errors.join(" ")).toMatch(/platform/);
    expect(errors.join(" ")).toMatch(/goal/);
    expect(errors.join(" ")).toMatch(/metric/);
    expect(ignored).toEqual(["My Notes"]);
  });

  it("warns when there's no date column, and when two columns mean the same thing", () => {
    const { errors, warnings } = checkHeaders(["Platform", "Goal", "Hook", "Views", "Reach"]);
    expect(errors).toEqual([]);
    expect(warnings[0]).toMatch(/No date column/);
    expect(warnings[1]).toBe('"Views" and "Reach" all count as views; the first filled-in one is used.');
  });

  it("a caption column can stand in for the hook", () => {
    expect(checkHeaders(["platform", "goal", "script", "views"]).errors).toEqual([]);
  });
});

describe("validateCsvRow", () => {
  it("cleans a valid row (numbers with commas, date at noon UTC)", () => {
    const check = validateCsvRow(row(), 2, OPTS, NOW);
    expect(check).toMatchObject({
      ok: true,
      line: 2,
      row: { platform: "instagram", format: "reel", goal: "leads", posted_at: "2026-09-14T12:00:00.000Z" },
    });
    if (check.ok) expect(check.row.metrics).toMatchObject({ views: 12000, dms: 31, likes: null });
  });

  it("understands common spellings", () => {
    const check = validateCsvRow(row({ platform: "IG", format: "Reels", goal: "Lead" }), 2, OPTS, NOW);
    expect(check).toMatchObject({ ok: true, row: { platform: "instagram", format: "reel", goal: "leads" } });
    expect(validateCsvRow(row({ platform: "YouTube Shorts", format: "" }), 2, OPTS, NOW)).toMatchObject({
      ok: true,
      row: { platform: "youtube", format: "short" },
    });
    expect(validateCsvRow(row({ platform: "tiktok", format: "photo mode" }), 2, OPTS, NOW)).toMatchObject({
      ok: true,
      row: { format: "carousel" },
    });
  });

  it("blank format means the platform's main video format", () => {
    expect(validateCsvRow(row({ format: "" }), 2, OPTS, NOW)).toMatchObject({ ok: true, row: { format: "reel" } });
  });

  it("shortens a long caption line used as the hook instead of rejecting the row", () => {
    const caption = "word ".repeat(140).trim(); // 699 characters, one paragraph
    const check = validateCsvRow(row({ hook: "", script: caption }), 2, OPTS, NOW);
    expect(check.ok).toBe(true);
    if (check.ok) {
      expect(check.row.hook.length).toBeLessThanOrEqual(500);
      expect(check.row.hook.endsWith("…")).toBe(true);
    }
  });

  it("reads ambiguous dates with the file's date order, and European numbers", () => {
    const dmy = { dateOrder: "dmy" as const, decimalComma: true };
    const check = validateCsvRow(row({ posted_at: "03/09/2026", views: "12.000", hold_3s_pct: "62,5" }), 2, dmy, NOW);
    expect(check).toMatchObject({ ok: true, row: { posted_at: "2026-09-03T12:00:00.000Z", metrics: { views: 12000, hold_3s_pct: 62.5 } } });
  });

  it("accepts 1.2K and treats N/A as blank", () => {
    expect(validateCsvRow(row({ views: "1.2K", dms: "N/A" }), 2, OPTS, NOW)).toMatchObject({
      ok: true,
      row: { metrics: { views: 1200, dms: null } },
    });
  });

  it("takes the hook from the caption's first line when the hook is blank", () => {
    const check = validateCsvRow(row({ hook: "", script: "\nFirst line here\nSecond line" }), 2, OPTS, NOW);
    expect(check).toMatchObject({ ok: true, row: { hook: "First line here" } });
  });

  it("reports every problem in the row", () => {
    const check = validateCsvRow(
      row({ platform: "facebook", goal: "", posted_at: "not a date", hold_3s_pct: "120", views: "lots" }),
      7,
      OPTS,
      NOW,
    );
    expect(check.ok).toBe(false);
    const text = errorsOf(check).join(" | ");
    expect(text).toMatch(/Unknown platform "facebook"/);
    expect(text).toMatch(/Goal is missing/);
    expect(text).toMatch(/isn't a date/);
    expect(text).toMatch(/3-sec hold % must be 100 or less/);
    expect(text).toMatch(/Views \/ reach: use numbers only/);
  });

  it("rejects a format that doesn't exist on the platform", () => {
    expect(errorsOf(validateCsvRow(row({ platform: "youtube", format: "carousel" }), 2, OPTS, NOW))[0]).toMatch(
      /Unknown YouTube Shorts format "carousel" \(use short\)/,
    );
  });

  it("needs at least one number", () => {
    expect(errorsOf(validateCsvRow(row({ views: "", dms: "" }), 2, OPTS, NOW))).toEqual([expect.stringMatching(/No numbers/)]);
  });

  it("needs a hook or a caption", () => {
    expect(errorsOf(validateCsvRow(row({ hook: "  ", script: "" }), 2, OPTS, NOW))[0]).toMatch(/Hook is missing/);
  });

  it("rejects future dates and over-long text", () => {
    expect(errorsOf(validateCsvRow(row({ posted_at: "2026-12-01" }), 2, OPTS, NOW))[0]).toMatch(/future/);
    expect(errorsOf(validateCsvRow(row({ hook: "x".repeat(501) }), 2, OPTS, NOW))[0]).toMatch(/Hook is too long/);
  });
});

describe("parseCsvText + templateCsv", () => {
  it("the template round-trips into valid rows (quotes and commas survive)", () => {
    const { records, options } = parseCsvText(templateCsv());
    const checks = records.map((r) => checkRecord(r, options, NOW));
    expect(checks.every((c) => c.ok)).toBe(true);
    if (checks[0].ok) {
      expect(checks[0].row.hook).toBe("I made $3,000 in 30 days with one DM keyword");
      expect(checks[0].row.on_screen_text).toBe('DM "PLAN" for the template');
    }
  });

  it("normalises messy headers, skips blank rows but keeps real row numbers (BOM, CRLF)", () => {
    const { headers, records } = parseCsvText('\uFEFFPlatform,Goal,Hook,Views\r\nig,views,Hello,"1,200"\r\n\r\n,,,\r\nig,views,,5\r\n');
    expect(headers).toEqual(["Platform", "Goal", "Hook", "Views"]);
    expect(records.map((r) => r.line)).toEqual([2, 5]);
    expect(checkRecord(records[0], OPTS, NOW)).toMatchObject({ ok: true, row: { metrics: { views: 1200 } } });
    expect(checkRecord(records[1], OPTS, NOW)).toMatchObject({ ok: false, line: 5 });
  });

  it("merges columns that mean the same thing (first filled-in wins)", () => {
    const { records } = parseCsvText("platform,goal,hook,Views,Reach\nig,views,A,,500\nig,views,B,90,500\n");
    expect(records.map((r) => r.data.views)).toEqual(["500", "90"]);
  });

  it("reports an unclosed quote instead of silently swallowing the rest of the file", () => {
    const { records } = parseCsvText('platform,goal,hook,views\nig,views,"Unclosed hook,100\nig,views,B,2\n');
    const check = checkRecord(records[0], OPTS, NOW);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.errors[0]).toMatch(/quote/);
  });

  it("flags rows with extra cells (an unquoted comma in the text)", () => {
    const { records } = parseCsvText("platform,goal,hook,views\nig,views,Hello, world,100\n");
    const check = checkRecord(records[0], OPTS, NOW);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.errors[0]).toMatch(/more cells than the header/);
  });

  it("detects the file's date order and semicolon/decimal-comma files", () => {
    const dmy = parseCsvText("platform;goal;hook;posted_at;views\nig;views;A;03/09/2026;1.200\nig;views;B;28/08/2026;2,5K\n");
    expect(dmy.options).toEqual({ dateOrder: "dmy", decimalComma: true });
    const checks = dmy.records.map((r) => checkRecord(r, dmy.options, NOW));
    expect(checks.map((c) => (c.ok ? [c.row.posted_at?.slice(0, 10), c.row.metrics.views] : c.errors))).toEqual([
      ["2026-09-03", 1200],
      ["2026-08-28", 2500],
    ]);
    expect(parseCsvText("platform,goal,hook,posted_at,views\nig,views,A,03/09/2026,1\n").options.dateOrder).toBe("mdy");
  });

  it("decodes Excel's windows-1252 files as well as UTF-8", () => {
    expect(decodeCsvBytes(new Uint8Array([0x44, 0x6f, 0x6e, 0x92, 0x74]))).toBe("Don’t");
    expect(decodeCsvBytes(new TextEncoder().encode("Don’t ₹"))).toBe("Don’t ₹");
  });
});

describe("chunkRows", () => {
  it("splits by row count", () => {
    const batches = chunkRows(Array.from({ length: 450 }, (_, i) => i), 200);
    expect(batches.map((b) => b.length)).toEqual([200, 200, 50]);
  });

  it("splits by size so a batch stays under the upload limit", () => {
    const big = { text: "x".repeat(300) };
    const batches = chunkRows([big, big, big, big, big], 200, 700);
    expect(batches.map((b) => b.length)).toEqual([2, 2, 1]);
  });

  it("counts bytes, not characters (Hindi text is 3 bytes per letter)", () => {
    const hindi = { text: "न".repeat(300) }; // ~900 bytes as UTF-8
    expect(chunkRows([hindi, hindi, hindi], 200, 1000).map((b) => b.length)).toEqual([1, 1, 1]);
  });

  it("returns nothing for no rows", () => {
    expect(chunkRows([])).toEqual([]);
  });
});

describe("duplicate detection", () => {
  const index: DuplicateIndex = new Map();
  addToDuplicateIndex(index, { platform: "instagram", hook: "  Stop  Posting at 9am ", posted_at: "2026-09-14T12:00:00+00:00" });
  addToDuplicateIndex(index, { platform: "tiktok", hook: "No date", posted_at: null });

  it("matches the same post ignoring case, spacing and time of day", () => {
    expect(isDuplicate(index, { platform: "instagram", hook: "stop posting at 9am", posted_at: "2026-09-14T18:30:00.000Z" })).toBe(true);
    expect(isDuplicate(index, { platform: "instagram", hook: "stop posting at 9am", posted_at: "2026-09-20T12:00:00.000Z" })).toBe(false);
    expect(isDuplicate(index, { platform: "tiktok", hook: "stop posting at 9am", posted_at: null })).toBe(false);
  });

  it("treats a missing date on either side as the same post (re-import after adding dates)", () => {
    expect(isDuplicate(index, { platform: "tiktok", hook: "no date", posted_at: "2026-09-01T12:00:00.000Z" })).toBe(true);
    expect(isDuplicate(index, { platform: "instagram", hook: "Stop posting at 9am", posted_at: null })).toBe(true);
  });
});
