import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { describeApiError, isCouponError } from "@/lib/errors";
import { canCustomerCancel, shortOrderId } from "@/features/orders/status";

const err = (code: string, details?: unknown, status = 409) => new ApiError(status, code, "raw server text", details);

describe("describeApiError", () => {
  it("explains stock problems from both the cart and checkout", () => {
    expect(describeApiError(err("INSUFFICIENT_STOCK", { available_quantity: 3 }))).toBe("Only 3 left in stock.");
    expect(describeApiError(err("INSUFFICIENT_STOCK", { available_quantity: 0 }))).toBe("This item just went out of stock.");
    expect(describeApiError(err("INSUFFICIENT_STOCK", { info: "some-product-id" }))).toMatch(/review your cart/i);
  });
  it("formats the minimum order from integer paise", () => {
    expect(describeApiError(err("BELOW_MINIMUM_ORDER", { info: "9900" }, 422))).toContain("₹99");
    expect(describeApiError(err("COUPON_MIN_ORDER_NOT_MET", { info: "29900" }, 422))).toContain("₹299");
    expect(describeApiError(err("BELOW_MINIMUM_ORDER", undefined, 422))).toMatch(/minimum order/i);
  });
  it("maps known business codes to friendly copy", () => {
    expect(describeApiError(err("PINCODE_NOT_SERVICEABLE", undefined, 422))).toMatch(/do not deliver/i);
    expect(describeApiError(err("COUPON_ALREADY_USED", undefined, 422))).toMatch(/already used/i);
    expect(describeApiError(err("CART_EMPTY", undefined, 400))).toMatch(/empty/i);
  });
  it("never leaks raw text for server errors or non-API errors", () => {
    expect(describeApiError(err("INTERNAL", undefined, 500))).not.toContain("raw server text");
    expect(describeApiError(new Error("TypeError: x is undefined"))).toBe("Something went wrong. Please try again.");
  });
  it("detects coupon errors", () => {
    expect(isCouponError(err("COUPON_INVALID", undefined, 422))).toBe(true);
    expect(isCouponError(err("CART_EMPTY", undefined, 400))).toBe(false);
    expect(isCouponError(new Error("x"))).toBe(false);
  });
});

describe("order helpers", () => {
  it("customers can cancel only before packing", () => {
    expect(canCustomerCancel("pending")).toBe(true);
    expect(canCustomerCancel("confirmed")).toBe(true);
    for (const s of ["packed", "out_for_delivery", "delivered", "cancelled"] as const) expect(canCustomerCancel(s)).toBe(false);
  });
  it("shortens ids for display", () => {
    expect(shortOrderId("abcdef12-3456-7890-abcd-ef1234567890")).toBe("ABCDEF12");
  });
});
