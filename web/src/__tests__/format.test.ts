import { describe, expect, it } from "vitest";

import { formatPercentChange, formatTonnes, kgToTonnes } from "../utils/format.js";

describe("format utilities", () => {
  it("formats tonnes for display without altering precision semantics", () => {
    expect(formatTonnes(22052.474)).toBe("22,052.5");
  });

  it("converts kg to tonnes for display", () => {
    expect(kgToTonnes(45385710.398)).toBeCloseTo(45385.710398, 3);
  });

  it("formats percent change deterministically", () => {
    expect(formatPercentChange(100, 63.65)).toBe("-36.4%");
    expect(formatPercentChange(482246, 697951)).toBe("+44.7%");
  });
});
