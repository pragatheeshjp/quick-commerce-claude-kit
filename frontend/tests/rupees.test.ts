import { describe, expect, it } from "vitest";
import { paiseToRupeesInput, parseRupeesToPaise } from "@/lib/rupees";

describe("parseRupeesToPaise", () => {
  it("converts with integer math, no float drift", () => {
    expect(parseRupeesToPaise("68")).toBe(6800);
    expect(parseRupeesToPaise("68.5")).toBe(6850);
    expect(parseRupeesToPaise("68.50")).toBe(6850);
    expect(parseRupeesToPaise("0.05")).toBe(5);
    expect(parseRupeesToPaise("19.99")).toBe(1999);
    expect(parseRupeesToPaise(" 1.10 ")).toBe(110); // 1.1 * 100 would be 110.00000000000001 with floats
    expect(parseRupeesToPaise("0.29")).toBe(29); // 0.29 * 100 = 28.999999999999996 with floats
  });
  it("rejects anything that is not plain rupees with up to 2 decimals", () => {
    for (const bad of ["", "abc", "-5", "1.234", "1,000", "₹5", "5.", ".5", "1e3", "12345678"]) {
      expect(parseRupeesToPaise(bad), bad).toBeNull();
    }
  });
  it("round-trips for pre-filling inputs", () => {
    for (const p of [0, 5, 110, 1999, 6800, 6850, 12345678]) expect(parseRupeesToPaise(paiseToRupeesInput(p))).toBe(p);
    expect(paiseToRupeesInput(6800)).toBe("68");
    expect(paiseToRupeesInput(6850)).toBe("68.50");
  });
});
