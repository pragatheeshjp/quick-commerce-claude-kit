import { describe, expect, it } from "vitest";
import { grantAdminBody, userIdParams } from "../src/validators/admin.js";
import {
  adminListProductsQuery, createCategoryBody, createProductBody, idParams, listProductsQuery, stockBody,
  updateCategoryBody, updateProductBody,
} from "../src/validators/catalog.js";
import { cartItemParams, createAddressBody, pincode, pincodeParams, setQuantityBody, updateAddressBody } from "../src/validators/commerce.js";
import { adminListOrdersQuery, changeStatusBody, checkoutBody, idempotencyKey, listOrdersQuery } from "../src/validators/orders.js";

const UUID = "11111111-1111-4111-8111-111111111111";
const ok = (s: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) => s.safeParse(v).success;

describe("catalog validators", () => {
  const product = { category_id: UUID, sku: "SKU-1", name: "Milk", unit_label: "1 L", price_paise: 6800, mrp_paise: 7000 };

  it("ids must be UUIDs", () => {
    expect(ok(idParams, { id: UUID })).toBe(true);
    for (const bad of ["1", "abc", "", `${UUID}x`]) expect(ok(idParams, { id: bad })).toBe(false);
    expect(ok(idParams, { id: UUID, extra: 1 })).toBe(false);
  });

  describe("product listing query", () => {
    it("defaults and coerces numbers", () => {
      expect(listProductsQuery.parse({})).toEqual({ page: 1, pageSize: 20 });
      expect(listProductsQuery.parse({ page: "3", pageSize: "50" })).toEqual({ page: 3, pageSize: 50 });
    });
    it("bounds pagination", () => {
      for (const q of [{ page: "0" }, { page: "10001" }, { pageSize: "0" }, { pageSize: "51" }, { page: "1.5" }, { page: "x" }]) expect(ok(listProductsQuery, q), JSON.stringify(q)).toBe(false);
    });
    it("search text allows only the safe character set", () => {
      // Includes Devanagari and Tamil, whose vowel signs are combining marks (\p{M}) rather than letters.
      for (const good of ["milk", "Amul Gold-500", "Ben & Jerry's", "a.b", "दूध", "पनीर", "பால்"]) expect(ok(listProductsQuery, { q: good }), good).toBe(true);
      for (const bad of ["a,b", "a(b)", "a%", "a*", "a;b", "a\"b", "x".repeat(61), "   ", "a|b", "a=b", "a:b"]) expect(ok(listProductsQuery, { q: bad }), bad).toBe(false);
    });
    it("category must be a slug", () => {
      expect(ok(listProductsQuery, { category: "dairy-eggs" })).toBe(true);
      for (const bad of ["Dairy", "dairy_eggs", "-a", "a-", "a--b"]) expect(ok(listProductsQuery, { category: bad })).toBe(false);
    });
    it("admin list defaults to including inactive and parses the flag", () => {
      expect(adminListProductsQuery.parse({}).includeInactive).toBe(true);
      expect(adminListProductsQuery.parse({ includeInactive: "false" }).includeInactive).toBe(false);
      expect(ok(adminListProductsQuery, { includeInactive: "maybe" })).toBe(false);
    });
  });

  describe("create product", () => {
    it("accepts a minimal valid product", () => expect(ok(createProductBody, product)).toBe(true));
    it("money must be whole non-negative paise within bounds", () => {
      for (const price of [55.5, -1, 100_000_001, "100", NaN, Infinity]) expect(ok(createProductBody, { ...product, price_paise: price, mrp_paise: 100_000_000 }), String(price)).toBe(false);
      expect(ok(createProductBody, { ...product, price_paise: 0, mrp_paise: 0 })).toBe(true);
    });
    it("MRP can equal but not undercut the price", () => {
      expect(ok(createProductBody, { ...product, price_paise: 7000, mrp_paise: 7000 })).toBe(true);
      expect(ok(createProductBody, { ...product, price_paise: 7001, mrp_paise: 7000 })).toBe(false);
    });
    it("rejects unknown fields (mass assignment) and malformed text", () => {
      for (const extra of [{ id: UUID }, { stock_quantity: 5 }, { role: "admin" }, { sku: "has space" }, { name: "" }, { unit_label: "" }, { image_path: "../etc/passwd" }, { image_path: "a b.png" }]) {
        expect(ok(createProductBody, { ...product, ...extra }), JSON.stringify(extra)).toBe(false);
      }
      expect(ok(createProductBody, { ...product, image_path: "dairy/milk-1.png" })).toBe(true);
    });
    it("opening stock is a bounded whole number", () => {
      for (const s of [-1, 1.5, 1_000_001]) expect(ok(createProductBody, { ...product, initial_stock: s })).toBe(false);
      expect(ok(createProductBody, { ...product, initial_stock: 0 })).toBe(true);
    });
  });

  describe("update product", () => {
    it("requires at least one field and never allows stock", () => {
      expect(ok(updateProductBody, {})).toBe(false);
      expect(ok(updateProductBody, { stock_quantity: 5 })).toBe(false);
      expect(ok(updateProductBody, { initial_stock: 5 })).toBe(false);
      expect(ok(updateProductBody, { name: "New" })).toBe(true);
    });
    it("only cross-checks MRP when both prices are present", () => {
      expect(ok(updateProductBody, { price_paise: 99999 })).toBe(true);
      expect(ok(updateProductBody, { price_paise: 200, mrp_paise: 100 })).toBe(false);
      expect(ok(updateProductBody, { price_paise: 100, mrp_paise: 100 })).toBe(true);
    });
  });

  describe("categories", () => {
    it("validates slug, name and optional parent", () => {
      expect(ok(createCategoryBody, { slug: "fresh-fruit", name: "Fresh fruit" })).toBe(true);
      expect(ok(createCategoryBody, { slug: "fresh-fruit", name: "F", parent_id: null, sort_order: 3, is_active: false })).toBe(true);
      for (const bad of [{ slug: "Fresh" }, { slug: "" }, { name: "" }, { parent_id: "x" }, { sort_order: -1 }, { sort_order: 1.5 }, { rogue: 1 }]) {
        expect(ok(createCategoryBody, { slug: "ok", name: "Ok", ...bad }), JSON.stringify(bad)).toBe(false);
      }
    });
    it("category updates need at least one field", () => {
      expect(ok(updateCategoryBody, {})).toBe(false);
      expect(ok(updateCategoryBody, { is_active: false })).toBe(true);
    });
  });

  describe("stock adjustment", () => {
    it("needs a non-zero whole delta and an allowed reason", () => {
      expect(ok(stockBody, { delta: -3, reason: "adjustment" })).toBe(true);
      expect(ok(stockBody, { delta: 10, reason: "restock" })).toBe(true);
      for (const bad of [{ delta: 0, reason: "restock" }, { delta: 1.5, reason: "restock" }, { delta: 1_000_001, reason: "restock" }, { delta: 1, reason: "order" }, { delta: 1, reason: "order_cancel" }, { delta: "5", reason: "restock" }, { delta: 1 }]) {
        expect(ok(stockBody, bad), JSON.stringify(bad)).toBe(false);
      }
    });
  });
});

describe("commerce validators", () => {
  it("pincodes are 6 digits and cannot start with 0", () => {
    for (const good of ["560001", "110001", "999999"]) expect(ok(pincode as never, good)).toBe(true);
    for (const bad of ["056001", "56001", "5600011", "56000a", "", " 560001", "560 001"]) expect(ok(pincode as never, bad), bad).toBe(false);
    expect(ok(pincodeParams, { pincode: "560001" })).toBe(true);
  });

  describe("address body", () => {
    const addr = { line1: "12 MG Road", city: "Bengaluru", state: "KA", pincode: "560001" };
    it("defaults the label and turns blank optionals into null", () => {
      expect(createAddressBody.parse(addr)).toMatchObject({ label: "Home" });
      expect(createAddressBody.parse({ ...addr, line2: "", landmark: "  " })).toMatchObject({ line2: null, landmark: null });
    });
    it("trims and bounds text; rejects unknown fields like user_id", () => {
      expect(createAddressBody.parse({ ...addr, line1: "  x  " }).line1).toBe("x");
      for (const bad of [{ line1: "" }, { line1: "x".repeat(201) }, { city: "" }, { pincode: "012345" }, { user_id: UUID }, { id: UUID }, { is_default: "yes" }]) {
        expect(ok(createAddressBody, { ...addr, ...bad }), JSON.stringify(bad)).toBe(false);
      }
    });
    it("updates need a field, and is_default can only be set to true", () => {
      expect(ok(updateAddressBody, {})).toBe(false);
      expect(ok(updateAddressBody, { is_default: true })).toBe(true);
      expect(ok(updateAddressBody, { is_default: false })).toBe(false);
      expect(ok(updateAddressBody, { label: "Work", landmark: null })).toBe(true);
      expect(ok(updateAddressBody, { user_id: UUID })).toBe(false);
    });
  });

  it("cart quantities are whole numbers from 1 to 50, and no prices are accepted", () => {
    for (const q of [1, 25, 50]) expect(ok(setQuantityBody, { quantity: q })).toBe(true);
    for (const bad of [{ quantity: 0 }, { quantity: 51 }, { quantity: -1 }, { quantity: 1.5 }, { quantity: "2" }, {}, { quantity: 2, price_paise: 1 }]) expect(ok(setQuantityBody, bad), JSON.stringify(bad)).toBe(false);
    expect(ok(cartItemParams, { productId: UUID })).toBe(true);
    expect(ok(cartItemParams, { productId: "x" })).toBe(false);
  });
});

describe("order validators", () => {
  it("checkout carries only an address and an optional coupon", () => {
    expect(ok(checkoutBody, { address_id: UUID })).toBe(true);
    expect(ok(checkoutBody, { address_id: UUID, coupon_code: "SAVE-10_x" })).toBe(true);
    for (const bad of [{}, { address_id: "x" }, { address_id: UUID, coupon_code: "bad code" }, { address_id: UUID, coupon_code: "" }, { address_id: UUID, coupon_code: "x".repeat(41) },
      { address_id: UUID, total_paise: 1 }, { address_id: UUID, items: [] }, { address_id: UUID, user_id: UUID }, { address_id: UUID, discount_paise: 100 }]) {
      expect(ok(checkoutBody, bad), JSON.stringify(bad)).toBe(false);
    }
  });

  it("idempotency keys are 8-128 chars from a safe alphabet", () => {
    for (const good of ["12345678", "a".repeat(128), "4f8a2c1e-0b7d-4f60-9c3e-1a2b3c4d5e6f", "key:abc.def_1-2"]) expect(ok(idempotencyKey as never, good), good).toBe(true);
    for (const bad of ["short", "a".repeat(129), "has space!", "semi;colon", "", undefined, 12345678]) expect(ok(idempotencyKey as never, bad), String(bad)).toBe(false);
  });

  it("order lists paginate with the same bounds, and the admin list validates status", () => {
    expect(listOrdersQuery.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(ok(listOrdersQuery, { pageSize: "51" })).toBe(false);
    expect(adminListOrdersQuery.parse({ status: "pending" }).status).toBe("pending");
    expect(ok(adminListOrdersQuery, { status: "shipped" })).toBe(false);
    expect(adminListOrdersQuery.parse({}).status).toBeUndefined();
  });

  it("admins can set any status except pending", () => {
    for (const s of ["confirmed", "packed", "out_for_delivery", "delivered", "cancelled"]) expect(ok(changeStatusBody, { status: s })).toBe(true);
    for (const bad of ["pending", "shipped", "", undefined]) expect(ok(changeStatusBody, { status: bad }), String(bad)).toBe(false);
    expect(ok(changeStatusBody, { status: "packed", note: "x" })).toBe(false);
  });
});

describe("admin validators", () => {
  it("normalises emails and requires a valid one", () => {
    expect(grantAdminBody.parse({ email: "  Boss@Example.COM " }).email).toBe("boss@example.com");
    for (const bad of [{}, { email: "nope" }, { email: "" }, { email: "a@b.co", role: "x" }]) expect(ok(grantAdminBody, bad), JSON.stringify(bad)).toBe(false);
  });
  it("user ids must be UUIDs", () => {
    expect(ok(userIdParams, { userId: UUID })).toBe(true);
    expect(ok(userIdParams, { userId: "admin" })).toBe(false);
  });
});
