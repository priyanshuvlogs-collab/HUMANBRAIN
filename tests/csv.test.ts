import { describe, expect, it } from "vitest";
import {
  checkHeaders,
  chunkRows,
  duplicateKey,
  normalizeHeader,
  parseCsvText,
  templateCsv,
  validateCsvRow,
  type RowCheck,
} from "@/lib/csv";

const NOW = new Date("2026-10-04T12:00:00Z");
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
    ["DMs", "dms"],
    ["﻿platform", "platform"],
    ["Something else", "something_else"],
  ])("%s → %s", (header, expected) => {
    expect(normalizeHeader(header)).toBe(expected);
  });
});

describe("checkHeaders", () => {
  it("accepts the template's columns", () => {
    expect(checkHeaders(parseCsvText(templateCsv()).headers)).toEqual({ errors: [], ignored: [] });
  });

  it("lists missing required columns and ignored extras", () => {
    const { errors, ignored } = checkHeaders(["hook", "notes"]);
    expect(errors.join(" ")).toMatch(/platform/);
    expect(errors.join(" ")).toMatch(/goal/);
    expect(errors.join(" ")).toMatch(/metric/);
    expect(ignored).toEqual(["notes"]);
  });

  it("a caption column can stand in for the hook", () => {
    expect(checkHeaders(["platform", "goal", "script", "views"]).errors).toEqual([]);
  });
});

describe("validateCsvRow", () => {
  it("cleans a valid row (numbers with commas, date at noon UTC)", () => {
    const check = validateCsvRow(row(), 2, NOW);
    expect(check).toMatchObject({
      ok: true,
      line: 2,
      row: { platform: "instagram", format: "reel", goal: "leads", posted_at: "2026-09-14T12:00:00.000Z" },
    });
    if (check.ok) expect(check.row.metrics).toMatchObject({ views: 12000, dms: 31, likes: null });
  });

  it("understands common spellings", () => {
    const check = validateCsvRow(row({ platform: "IG", format: "Reels", goal: "Lead" }), 2, NOW);
    expect(check).toMatchObject({ ok: true, row: { platform: "instagram", format: "reel", goal: "leads" } });
    expect(validateCsvRow(row({ platform: "YouTube Shorts", format: "" }), 2, NOW)).toMatchObject({
      ok: true,
      row: { platform: "youtube", format: "short" },
    });
    expect(validateCsvRow(row({ platform: "tiktok", format: "photo mode" }), 2, NOW)).toMatchObject({
      ok: true,
      row: { format: "carousel" },
    });
  });

  it("blank format means the platform's main video format", () => {
    expect(validateCsvRow(row({ format: "" }), 2, NOW)).toMatchObject({ ok: true, row: { format: "reel" } });
  });

  it("takes the hook from the caption's first line when the hook is blank", () => {
    const check = validateCsvRow(row({ hook: "", script: "\nFirst line here\nSecond line" }), 2, NOW);
    expect(check).toMatchObject({ ok: true, row: { hook: "First line here" } });
  });

  it("reports every problem in the row", () => {
    const check = validateCsvRow(
      row({ platform: "facebook", goal: "", posted_at: "not a date", hold_3s_pct: "120", views: "lots" }),
      7,
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
    expect(errorsOf(validateCsvRow(row({ platform: "youtube", format: "carousel" }), 2, NOW))[0]).toMatch(
      /Unknown YouTube Shorts format "carousel" \(use short\)/,
    );
  });

  it("needs at least one number", () => {
    expect(errorsOf(validateCsvRow(row({ views: "", dms: "" }), 2, NOW))).toEqual([expect.stringMatching(/No numbers/)]);
  });

  it("needs a hook or a caption", () => {
    expect(errorsOf(validateCsvRow(row({ hook: "  ", script: "" }), 2, NOW))[0]).toMatch(/Hook is missing/);
  });

  it("rejects future dates and over-long text", () => {
    expect(errorsOf(validateCsvRow(row({ posted_at: "2026-12-01" }), 2, NOW))[0]).toMatch(/future/);
    expect(errorsOf(validateCsvRow(row({ hook: "x".repeat(501) }), 2, NOW))[0]).toMatch(/Hook is too long/);
  });
});

describe("parseCsvText + templateCsv", () => {
  it("the template round-trips into valid rows (quotes and commas survive)", () => {
    const { records } = parseCsvText(templateCsv());
    const checks = records.map((r, i) => validateCsvRow(r, i + 2, NOW));
    expect(checks.every((c) => c.ok)).toBe(true);
    if (checks[0].ok) {
      expect(checks[0].row.hook).toBe("I made $3,000 in 30 days with one DM keyword");
      expect(checks[0].row.on_screen_text).toBe('DM "PLAN" for the template');
    }
  });

  it("normalises messy headers and skips blank lines", () => {
    const { headers, records } = parseCsvText("Platform,Goal,Hook,Views\r\nig,views,Hello,\"1,200\"\r\n\r\n,,,\r\n");
    expect(headers).toEqual(["platform", "goal", "hook", "views"]);
    expect(records).toHaveLength(1);
    expect(validateCsvRow(records[0], 2, NOW)).toMatchObject({ ok: true, row: { metrics: { views: 1200 } } });
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

  it("returns nothing for no rows", () => {
    expect(chunkRows([])).toEqual([]);
  });
});

describe("duplicateKey", () => {
  it("ignores case, spacing and time of day", () => {
    expect(duplicateKey({ platform: "instagram", hook: "  Stop  Posting at 9am ", posted_at: "2026-09-14T12:00:00.000Z" })).toBe(
      duplicateKey({ platform: "instagram", hook: "stop posting at 9am", posted_at: "2026-09-14T18:30:00+00:00" }),
    );
    expect(duplicateKey({ platform: "tiktok", hook: "a", posted_at: null })).toBe("tiktok|a|");
  });
});
