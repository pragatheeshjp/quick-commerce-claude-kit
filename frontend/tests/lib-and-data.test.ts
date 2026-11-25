import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NEXT_STATUSES } from "@/features/admin/order-transitions";
import { formatOrderDate, shortOrderId, STATUS_LABEL, TIMELINE } from "@/features/orders/status";
import { api, ApiError, apiBaseUrl } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import {
  addressSchema, categoryFormSchema, couponSchema, fieldErrors, grantAdminSchema, productFormSchema, stockSchema,
} from "@/lib/validation";

const UUID = "11111111-1111-4111-8111-111111111111";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("apiBaseUrl", () => {
  it("uses NEXT_PUBLIC_API_URL in the browser, ignoring the internal URL, and trims trailing slashes", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.com//");
    vi.stubEnv("API_INTERNAL_URL", "http://backend:4000");
    expect(apiBaseUrl()).toBe("https://api.example.com");
  });

  it("falls back to localhost:4000 when nothing is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    vi.stubEnv("API_INTERNAL_URL", "");
    expect(apiBaseUrl()).toBe("http://localhost:4000");
  });

  it("prefers the internal service URL when rendering on the server (Docker networking)", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:4000");
    vi.stubEnv("API_INTERNAL_URL", "http://backend:4000/");
    vi.stubGlobal("window", undefined);
    expect(apiBaseUrl()).toBe("http://backend:4000");
  });
});

describe("api client edge cases", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_API_URL", "http://api.test"));

  it("never caches API responses", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, data: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await api("/x");
    expect((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].cache).toBe("no-store");
  });

  it("lets caller abort signals through without converting them into API errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("aborted", "AbortError"); }));
    await expect(api("/x")).rejects.toMatchObject({ name: "AbortError" });
  });

  it("treats success:false as an error even on HTTP 200, with defaults for missing fields", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: false }), { status: 200 })));
    await expect(api("/x")).rejects.toMatchObject({ code: "UNKNOWN", message: "Something went wrong." });
  });

  it("merges caller headers and omits Content-Type for requests without a body", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, data: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await api("/x", { headers: { "Idempotency-Key": "abc-12345" } });
    const headers = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe("abc-12345");
    expect(headers.Accept).toBe("application/json");
    expect(headers["Content-Type"]).toBeUndefined();
  });

  it("ApiError carries status, code and details", () => {
    const e = new ApiError(409, "CONFLICT", "msg", { a: 1 });
    expect(e).toBeInstanceOf(Error);
    expect(e).toMatchObject({ name: "ApiError", status: 409, code: "CONFLICT", details: { a: 1 } });
  });
});

describe("describeApiError (remaining codes)", () => {
  const e = (code: string, status = 409, details?: unknown) => describeApiError(new ApiError(status, code, "raw", details));

  it("covers authentication, availability and validation codes", () => {
    expect(e("UNAUTHORIZED", 401)).toMatch(/log in again/i);
    expect(e("PRODUCT_UNAVAILABLE")).toMatch(/no longer available/i);
    expect(e("ADDRESS_NOT_FOUND", 404)).toMatch(/no longer available/i);
    expect(e("COUPON_INVALID", 422)).toBe("This coupon is not valid.");
    expect(e("COUPON_EXHAUSTED", 422)).toMatch(/no longer available/i);
    expect(e("INVALID_TRANSITION")).toMatch(/can no longer be changed/i);
    expect(e("VALIDATION_ERROR", 400)).toMatch(/check the details/i);
  });

  it("passes network errors through, uses the message for unknown 4xx and hides it for 5xx", () => {
    expect(describeApiError(new ApiError(0, "NETWORK_ERROR", "Cannot reach the server."))).toBe("Cannot reach the server.");
    expect(e("SOMETHING_NEW", 418)).toBe("raw");
    expect(e("SOMETHING_NEW", 503)).not.toContain("raw");
  });

  it("copes with missing or malformed details", () => {
    expect(e("BELOW_MINIMUM_ORDER", 422, { info: "not-a-number" })).toMatch(/below the minimum/i);
    expect(e("INSUFFICIENT_STOCK", 409, {})).toMatch(/review your cart/i);
    expect(e("COUPON_MIN_ORDER_NOT_MET", 422)).toMatch(/minimum value/i);
  });
});

describe("order status helpers", () => {
  it("has a label for every status and a timeline of the five forward steps in order", () => {
    expect(Object.keys(STATUS_LABEL).sort()).toEqual(["cancelled", "confirmed", "delivered", "out_for_delivery", "packed", "pending"]);
    expect(TIMELINE).toEqual(["pending", "confirmed", "packed", "out_for_delivery", "delivered"]);
  });
  it("formats dates in Indian English and shortens ids", () => {
    const text = formatOrderDate("2026-11-22T10:30:00Z");
    expect(text).toMatch(/2026/);
    expect(text).toMatch(/Nov/);
    expect(shortOrderId("abcdef12-3456")).toBe("ABCDEF12");
  });
  it("the admin transition table matches the API's rules exactly", () => {
    expect(NEXT_STATUSES).toEqual({
      pending: ["confirmed", "cancelled"],
      confirmed: ["packed", "cancelled"],
      packed: ["out_for_delivery"],
      out_for_delivery: ["delivered"],
      delivered: [],
      cancelled: [],
    });
  });
});

describe("validation schemas", () => {
  it("fieldErrors keeps only the first message per field", () => {
    const r = addressSchema.safeParse({ label: "", line1: "", city: "", state: "", pincode: "1" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const errs = fieldErrors(r.error);
      expect(Object.keys(errs).sort()).toEqual(["city", "label", "line1", "pincode", "state"]);
      expect(typeof errs.label).toBe("string");
    }
  });

  it("address optionals become null and text is trimmed", () => {
    expect(addressSchema.parse({ label: " Home ", line1: " x ", line2: "", landmark: "  ", city: "c", state: "s", pincode: "560001" }))
      .toMatchObject({ label: "Home", line1: "x", line2: null, landmark: null });
  });

  it("coupon codes are trimmed and limited to letters, digits, - and _", () => {
    expect(couponSchema.parse("  SAVE_10-x ")).toBe("SAVE_10-x");
    for (const bad of ["", "   ", "has space", "semi;colon", "x".repeat(41), "₹100"]) expect(couponSchema.safeParse(bad).success, bad).toBe(false);
  });

  it("stock changes are signed non-zero integers with a fixed reason", () => {
    expect(stockSchema.parse({ delta: "-3", reason: "adjustment" })).toEqual({ delta: -3, reason: "adjustment" });
    expect(stockSchema.parse({ delta: " 20 ", reason: "restock" }).delta).toBe(20);
    for (const bad of [{ delta: "0", reason: "restock" }, { delta: "1.5", reason: "restock" }, { delta: "abc", reason: "restock" }, { delta: "", reason: "restock" }, { delta: "1", reason: "order" }]) {
      expect(stockSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it("category forms convert an empty parent to null and the sort order to a number", () => {
    const parsed = categoryFormSchema.parse({ name: " Dairy ", slug: "dairy", parent_id: "", sort_order: "5", is_active: true });
    expect(parsed).toEqual({ name: "Dairy", slug: "dairy", parent_id: null, sort_order: 5, is_active: true });
    expect(categoryFormSchema.parse({ name: "Milk", slug: "milk", parent_id: UUID, sort_order: "0", is_active: false }).parent_id).toBe(UUID);
    for (const bad of [{ slug: "Dairy" }, { slug: "a--b" }, { sort_order: "-1" }, { sort_order: "1.5" }, { parent_id: "not-a-uuid" }, { name: "" }]) {
      expect(categoryFormSchema.safeParse({ name: "N", slug: "n", parent_id: "", sort_order: "0", is_active: true, ...bad }).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it("admin grants need a valid email", () => {
    expect(grantAdminSchema.safeParse({ email: "boss@example.com" }).success).toBe(true);
    expect(grantAdminSchema.safeParse({ email: "boss" }).success).toBe(false);
  });

  describe("product form", () => {
    const base = { category_id: UUID, sku: "BTR-1", name: "Butter", brand: "", unit_label: "100 g", description: "", price: "55.50", mrp: "60", is_active: true, initial_stock: "" };
    it("converts rupees to integer paise and defaults opening stock to 0", () => {
      expect(productFormSchema.parse(base)).toMatchObject({ price: 5550, mrp: 6000, initial_stock: 0, brand: null, description: null });
      expect(productFormSchema.parse({ ...base, price: "0.29", mrp: "0.29", initial_stock: "25" })).toMatchObject({ price: 29, mrp: 29, initial_stock: 25 });
    });
    it("rejects bad prices, MRP below price, bad SKUs and fractional stock", () => {
      for (const bad of [{ price: "12.345" }, { price: "-1" }, { price: "abc" }, { mrp: "" }, { price: "70", mrp: "60" }, { sku: "has space" }, { sku: "" }, { initial_stock: "1.5" }, { initial_stock: "-2" }, { category_id: "" }]) {
        expect(productFormSchema.safeParse({ ...base, ...bad }).success, JSON.stringify(bad)).toBe(false);
      }
    });
    it("reports the MRP error on the mrp field", () => {
      const r = productFormSchema.safeParse({ ...base, price: "70", mrp: "60" });
      expect(r.success ? {} : fieldErrors(r.error)).toEqual({ mrp: "MRP cannot be lower than the price" });
    });
  });
});
