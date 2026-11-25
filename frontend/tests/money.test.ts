import { describe, expect, it } from "vitest";
import { discountPercent, formatPaise } from "@/lib/money";

describe("formatPaise", () => {
  it("formats whole rupees without decimals", () => {
    expect(formatPaise(6800)).toBe("₹68");
    expect(formatPaise(0)).toBe("₹0");
  });
  it("keeps two-digit paise", () => {
    expect(formatPaise(4550)).toBe("₹45.50");
    expect(formatPaise(5)).toBe("₹0.05");
    expect(formatPaise(199)).toBe("₹1.99");
  });
  it("uses Indian digit grouping", () => {
    expect(formatPaise(1234567)).toBe("₹12,345.67");
    expect(formatPaise(10000000)).toBe("₹1,00,000");
  });
  it("handles negatives and refuses non-integer money", () => {
    expect(formatPaise(-2500)).toBe("-₹25");
    expect(() => formatPaise(10.5)).toThrow();
    expect(() => formatPaise(0.1 + 0.2)).toThrow();
  });
});

describe("discountPercent", () => {
  it("rounds down and is 0 without a saving", () => {
    expect(discountPercent(4500, 5000)).toBe(10);
    expect(discountPercent(6800, 10500)).toBe(35);
    expect(discountPercent(5000, 5000)).toBe(0);
    expect(discountPercent(5000, 0)).toBe(0);
  });
});
