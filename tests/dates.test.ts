import { describe, expect, it } from "vitest";
import { detectDateOrder, parseDateInput, toDateInputValue } from "@/lib/dates";

const NOW = new Date("2026-10-04T12:00:00Z");
const value = (input: unknown) => {
  const r = parseDateInput(input, "Date", NOW);
  return r.ok ? r.value : `error: ${r.error}`;
};

describe("parseDateInput", () => {
  it("blank → null", () => {
    expect(value("")).toBeNull();
    expect(value("   ")).toBeNull();
    expect(value(null)).toBeNull();
  });

  it("YYYY-MM-DD at noon UTC (same calendar day in almost every time zone)", () => {
    expect(value("2026-09-14")).toBe("2026-09-14T12:00:00.000Z");
  });

  it("slashes: month/day by default, day/month when the first number is over 12", () => {
    expect(value("09/01/2026")).toBe("2026-09-01T12:00:00.000Z");
    expect(value("14/09/2026")).toBe("2026-09-14T12:00:00.000Z");
    expect(value("9/14/26")).toBe("2026-09-14T12:00:00.000Z");
    expect(value("2026/09/14")).toBe("2026-09-14T12:00:00.000Z");
  });

  it("follows the file's date order for ambiguous dates; dots are always day-first", () => {
    const dmy = (input: string) => {
      const r = parseDateInput(input, "Date", NOW, { order: "dmy" });
      return r.ok ? r.value : r.error;
    };
    expect(dmy("03/09/2026")).toBe("2026-09-03T12:00:00.000Z");
    expect(dmy("09/14/2026")).toBe("2026-09-14T12:00:00.000Z"); // only valid as month/day
    expect(value("05.09.2026")).toBe("2026-09-05T12:00:00.000Z");
  });

  it("keeps a time when one is given (treated as UTC)", () => {
    expect(value("2026-09-14 18:30")).toBe("2026-09-14T18:30:00.000Z");
    expect(value("09/14/2026 6:30 pm")).toBe("2026-09-14T18:30:00.000Z");
    expect(value("09/14/2026 12:05 am")).toBe("2026-09-14T00:05:00.000Z");
    expect(value("2026-09-14T18:30:00+05:30")).toBe("2026-09-14T13:00:00.000Z");
  });

  it("month names (read in UTC, so browser and server agree)", () => {
    expect(value("Sep 14, 2026")).toBe("2026-09-14T12:00:00.000Z");
    expect(value("Sep 14, 2026 11:30 PM")).toBe("2026-09-14T23:30:00.000Z");
    expect(value("Sep 14")).toMatch(/needs a year/);
  });

  it("rejects impossible dates, garbage and the future", () => {
    expect(value("2026-02-30")).toMatch(/^error: Date "2026-02-30" isn't a date/);
    expect(value("13/13/2026")).toMatch(/isn't a date/);
    expect(value("soon")).toMatch(/isn't a date/);
    expect(value("2026-10-07")).toMatch(/can't be in the future/);
    expect(value("1999-01-01")).toMatch(/too old/);
  });

  it("allows tomorrow's date (time zones ahead of UTC)", () => {
    expect(value("2026-10-05")).toBe("2026-10-05T12:00:00.000Z");
  });
});

describe("detectDateOrder", () => {
  it("decides once per file from the dates that prove it", () => {
    expect(detectDateOrder(["03/09/2026", "28/08/2026", ""])).toBe("dmy");
    expect(detectDateOrder(["03/09/2026", "08/28/2026"])).toBe("mdy");
    expect(detectDateOrder(["03/09/2026", "2026-09-01", null])).toBe("mdy");
    expect(detectDateOrder(["13.09.2026"])).toBe("mdy"); // dotted dates don't vote (always day-first)
  });
});

describe("toDateInputValue", () => {
  it("formats for <input type=date>", () => {
    expect(toDateInputValue("2026-09-14T12:00:00.000Z")).toBe("2026-09-14");
    expect(toDateInputValue(null)).toBe("");
  });
});
