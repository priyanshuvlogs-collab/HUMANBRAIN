import { describe, expect, it } from "vitest";
import { MAX_ACTIVE_PERSONAS } from "@/lib/constants";
import { activeStateForNewPersona, canActivateAnother, isPersonaLimitError } from "@/lib/personas";

describe("active persona limit (app side)", () => {
  it("the limit is 10", () => {
    expect(MAX_ACTIVE_PERSONAS).toBe(10);
  });

  it("allows switching on while under 10, blocks at 10", () => {
    expect(canActivateAnother(0)).toBe(true);
    expect(canActivateAnother(9)).toBe(true);
    expect(canActivateAnother(10)).toBe(false);
    expect(canActivateAnother(11)).toBe(false);
  });

  it("a new persona added at 10 active is saved switched off", () => {
    expect(activeStateForNewPersona(5)).toBe(true);
    expect(activeStateForNewPersona(10)).toBe(false);
  });

  it("recognises the database limit error", () => {
    expect(isPersonaLimitError({ code: "23514" })).toBe(true);
    expect(isPersonaLimitError({ code: "23505" })).toBe(false);
    expect(isPersonaLimitError(null)).toBe(false);
  });
});
