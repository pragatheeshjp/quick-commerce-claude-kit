import { describe, expect, it, vi } from "vitest";
import type { AddressRepository } from "../src/repositories/address.repository.js";
import type { CartRepository } from "../src/repositories/cart.repository.js";
import type { CatalogRepository } from "../src/repositories/catalog.repository.js";
import type { OrderRepository } from "../src/repositories/order.repository.js";
import { createCatalogService } from "../src/services/catalog.service.js";
import { createAddressService, createCartService, MAX_ADDRESSES } from "../src/services/commerce.service.js";
import { createOrderService } from "../src/services/order.service.js";
import type { CartLineRow } from "../src/types/commerce.js";
import type { ProductRow } from "../src/types/catalog.js";
import type { OrderRow } from "../src/types/orders.js";

const BASE = "https://x.supabase.co/storage/v1/object/public";

const product = (o: Partial<ProductRow> = {}): ProductRow => ({
  id: "p1", category_id: "c1", sku: "SKU", name: "Milk", description: "d", brand: "B", unit_label: "1 L",
  price_paise: 6800, mrp_paise: 7000, stock_quantity: 5, image_path: "milk.png", is_active: true, ...o,
});

describe("catalog service (public view)", () => {
  const repo = { listCategories: vi.fn(async () => []), listProducts: vi.fn(), getProduct: vi.fn() };
  const svc = createCatalogService(repo as unknown as CatalogRepository, BASE);

  it("exposes only the customer-safe fields: no stock count, no active flag", async () => {
    repo.listProducts.mockResolvedValue({ items: [product()], total: 1 });
    const { items } = await svc.listProducts({ page: 1, pageSize: 20 });
    expect(Object.keys(items[0]!).sort()).toEqual(
      ["brand", "category_id", "description", "id", "image_url", "in_stock", "mrp_paise", "name", "price_paise", "sku", "unit_label"],
    );
  });

  it("in_stock flips exactly at zero", async () => {
    repo.listProducts.mockResolvedValue({ items: [product({ stock_quantity: 0 }), product({ stock_quantity: 1 })], total: 2 });
    const { items } = await svc.listProducts({ page: 1, pageSize: 20 });
    expect(items.map((p) => p.in_stock)).toEqual([false, true]);
  });

  it("builds the public image URL from the storage path, or null", async () => {
    repo.listProducts.mockResolvedValue({ items: [product(), product({ image_path: null })], total: 2 });
    const { items } = await svc.listProducts({ page: 1, pageSize: 20 });
    expect(items[0]!.image_url).toBe(`${BASE}/product-images/milk.png`);
    expect(items[1]!.image_url).toBeNull();
  });

  it("always asks the repository for active products only, and echoes pagination", async () => {
    repo.listProducts.mockResolvedValue({ items: [], total: 57 });
    const res = await svc.listProducts({ category: "dairy", q: "milk", page: 3, pageSize: 10 });
    expect(repo.listProducts).toHaveBeenLastCalledWith({ categorySlug: "dairy", q: "milk", page: 3, pageSize: 10, includeInactive: false });
    expect(res.meta).toEqual({ page: 3, pageSize: 10, total: 57 });
  });

  it("lists only active categories to customers and 404s unknown or inactive products", async () => {
    await svc.listCategories();
    expect(repo.listCategories).toHaveBeenCalledWith(false);
    repo.getProduct.mockResolvedValue(null);
    await expect(svc.getProduct("nope")).rejects.toMatchObject({ status: 404 });
    expect(repo.getProduct).toHaveBeenLastCalledWith("nope", false);
  });
});

describe("catalog service (admin view)", () => {
  const repo = { createProduct: vi.fn(), updateProduct: vi.fn(), getProduct: vi.fn(), adjustStock: vi.fn(), listProducts: vi.fn() };
  const svc = createCatalogService(repo as unknown as CatalogRepository, BASE);

  it("includes stock and inactive flag, plus the image URL", async () => {
    repo.getProduct.mockResolvedValue(product({ is_active: false, stock_quantity: 9 }));
    expect(await svc.admin.getProduct("p1")).toMatchObject({ stock_quantity: 9, is_active: false, image_url: `${BASE}/product-images/milk.png` });
    expect(repo.getProduct).toHaveBeenCalledWith("p1", true);
  });

  it("maps initial_stock to opening stock (default 0) and records who created it", async () => {
    repo.createProduct.mockImplementation(async (i: object) => ({ ...product(), ...i }));
    await svc.admin.createProduct({ sku: "S", initial_stock: 12 }, "admin-1");
    expect(repo.createProduct).toHaveBeenLastCalledWith({ sku: "S", stock_quantity: 12 }, "admin-1");
    await svc.admin.createProduct({ sku: "S" }, "admin-1");
    expect(repo.createProduct).toHaveBeenLastCalledWith({ sku: "S", stock_quantity: 0 }, "admin-1");
  });

  it("returns the new quantity after a stock adjustment and 404s unknown products", async () => {
    repo.adjustStock.mockResolvedValue(7);
    expect(await svc.admin.adjustStock("p1", -3, "adjustment", "admin-1")).toEqual({ id: "p1", stock_quantity: 7 });
    repo.getProduct.mockResolvedValue(null);
    await expect(svc.admin.getProduct("x")).rejects.toMatchObject({ status: 404 });
  });

  it("lists with inactive products when asked", async () => {
    repo.listProducts.mockResolvedValue({ items: [product({ is_active: false })], total: 1 });
    const res = await svc.admin.listProducts({ page: 1, pageSize: 20, includeInactive: true });
    expect(repo.listProducts).toHaveBeenLastCalledWith(expect.objectContaining({ includeInactive: true }));
    expect(res.items[0]).toMatchObject({ is_active: false, stock_quantity: 5 });
  });
});

describe("cart service", () => {
  const line = (o: Partial<CartLineRow["product"]> = {}, quantity = 2, id = "p1"): CartLineRow => ({
    product_id: id, quantity,
    product: { id, name: "Milk", unit_label: "1 L", price_paise: 6800, mrp_paise: 7000, stock_quantity: 10, image_path: null, is_active: true, ...o },
  });
  const make = (lines: CartLineRow[]) => {
    const repo = { getLines: vi.fn(async () => lines), getProductForCart: vi.fn(), setQuantity: vi.fn(), removeItem: vi.fn(), clear: vi.fn() };
    return { repo, svc: createCartService(repo as unknown as CartRepository, BASE) };
  };

  it("prices lines in integer paise and totals only the purchasable ones", async () => {
    const { svc } = make([line({}, 3, "a"), line({ price_paise: 1999 }, 2, "b"), line({ is_active: false }, 5, "c"), line({ stock_quantity: 1 }, 4, "d")]);
    const v = await svc.view("u1");
    expect(v.items.map((i) => i.line_total_paise)).toEqual([20400, 3998, 34000, 27200]);
    expect(v.subtotal_paise).toBe(20400 + 3998);
    expect(v.item_count).toBe(14);
    expect(Number.isInteger(v.subtotal_paise)).toBe(true);
  });

  it("explains why a line is not purchasable and how much is available", async () => {
    const { svc } = make([line({ is_active: false }, 1, "a"), line({ stock_quantity: 2 }, 5, "b"), line({}, 1, "c")]);
    const [gone, low, ok] = (await svc.view("u1")).items;
    expect(gone).toMatchObject({ purchasable: false, issue: "unavailable" });
    expect(gone).not.toHaveProperty("available_quantity");
    expect(low).toMatchObject({ purchasable: false, issue: "insufficient_stock", available_quantity: 2 });
    expect(ok).toMatchObject({ purchasable: true, issue: null });
  });

  it("a line is purchasable at exactly the available stock", async () => {
    const { svc } = make([line({ stock_quantity: 3 }, 3)]);
    expect((await svc.view("u1")).items[0]).toMatchObject({ purchasable: true, issue: null });
  });

  it("an empty cart is a zero total, not an error", async () => {
    expect(await make([]).svc.view("u1")).toEqual({ items: [], item_count: 0, subtotal_paise: 0 });
  });

  it("sets a quantity up to the stock limit, and rejects above it with the available amount", async () => {
    const { svc, repo } = make([]);
    repo.getProductForCart.mockResolvedValue({ id: "p1", stock_quantity: 5, is_active: true });
    await svc.setQuantity("u1", "p1", 5);
    expect(repo.setQuantity).toHaveBeenCalledWith("u1", "p1", 5);
    await expect(svc.setQuantity("u1", "p1", 6)).rejects.toMatchObject({ status: 409, code: "INSUFFICIENT_STOCK", details: { available_quantity: 5 } });
    expect(repo.setQuantity).toHaveBeenCalledTimes(1);
  });

  it("treats missing and inactive products identically (404)", async () => {
    const { svc, repo } = make([]);
    repo.getProductForCart.mockResolvedValue(null);
    await expect(svc.setQuantity("u1", "p1", 1)).rejects.toMatchObject({ status: 404 });
    repo.getProductForCart.mockResolvedValue({ id: "p1", stock_quantity: 5, is_active: false });
    await expect(svc.setQuantity("u1", "p1", 1)).rejects.toMatchObject({ status: 404 });
  });

  it("remove and clear act for the given user and return the fresh view", async () => {
    const { svc, repo } = make([]);
    expect(await svc.removeItem("u1", "p1")).toMatchObject({ items: [] });
    expect(repo.removeItem).toHaveBeenCalledWith("u1", "p1");
    await svc.clear("u1");
    expect(repo.clear).toHaveBeenCalledWith("u1");
  });
});

describe("address service", () => {
  const input = { label: "Home", line1: "x", line2: null, landmark: null, city: "c", state: "s", pincode: "560001" };
  const make = (count: number) => {
    const repo = { count: vi.fn(async () => count), create: vi.fn(async (_u: string, i: object) => i), findPincode: vi.fn() };
    return { repo, svc: createAddressService(repo as unknown as AddressRepository) };
  };

  it("makes the very first address the default", async () => {
    const { svc, repo } = make(0);
    await svc.create("u1", input);
    expect(repo.create).toHaveBeenCalledWith("u1", expect.objectContaining({ is_default: true }));
  });

  it("keeps later addresses non-default unless asked", async () => {
    const { svc, repo } = make(3);
    await svc.create("u1", input);
    expect(repo.create.mock.calls[0]![1]).toMatchObject({ is_default: false });
    await svc.create("u1", { ...input, is_default: true });
    expect(repo.create.mock.calls[1]![1]).toMatchObject({ is_default: true });
  });

  it(`stops at ${MAX_ADDRESSES} addresses`, async () => {
    const { svc, repo } = make(MAX_ADDRESSES);
    await expect(svc.create("u1", input)).rejects.toMatchObject({ status: 400 });
    expect(repo.create).not.toHaveBeenCalled();
    const { svc: ok } = make(MAX_ADDRESSES - 1);
    await expect(ok.create("u1", input)).resolves.toBeDefined();
  });

  it("reports serviceability with delivery terms, or just false", async () => {
    const { svc, repo } = make(0);
    repo.findPincode.mockResolvedValueOnce({ pincode: "560001", area_name: "MG Road", city: "Bengaluru", delivery_fee_paise: 2500, min_order_paise: 9900, is_active: true });
    expect(await svc.serviceability("560001")).toEqual({ pincode: "560001", serviceable: true, area_name: "MG Road", city: "Bengaluru", delivery_fee_paise: 2500, min_order_paise: 9900 });
    repo.findPincode.mockResolvedValueOnce(null);
    expect(await svc.serviceability("999999")).toEqual({ pincode: "999999", serviceable: false });
  });
});

describe("order service", () => {
  const order = (o: Partial<OrderRow> = {}): OrderRow => ({
    id: "o1", user_id: "u1", status: "pending", delivery_address: {}, subtotal_paise: 100, discount_paise: 0, delivery_fee_paise: 0, total_paise: 100,
    created_at: "t", order_items: [{ product_id: "p", sku: "S", name: "N", quantity: 3, unit_price_paise: 150 }], ...o,
  });
  const totals = { subtotal_paise: 100, discount_paise: 0, delivery_fee_paise: 0, total_paise: 100 };
  const make = (over: Record<string, unknown> = {}) => {
    const repo = {
      checkout: vi.fn(async () => ({ order_id: "o1", replayed: false, ...totals })),
      getForUser: vi.fn(async () => order()), getAny: vi.fn(async () => order()), cancel: vi.fn(), transition: vi.fn(async () => true),
      listForUser: vi.fn(async () => ({ items: [order()], total: 1 })), listAll: vi.fn(async () => ({ items: [order()], total: 1 })), ...over,
    };
    return { repo, svc: createOrderService(repo as unknown as OrderRepository) };
  };

  it("quote runs the same checkout as a dry run and returns totals only", async () => {
    const { svc, repo } = make();
    expect(await svc.quote("u1", { address_id: "a1", coupon_code: "X" })).toEqual(totals);
    expect(repo.checkout).toHaveBeenCalledWith({ userId: "u1", addressId: "a1", idempotencyKey: "quote", couponCode: "X", dryRun: true });
  });

  it("place order passes the key through and reports replays", async () => {
    const { svc, repo } = make({ checkout: vi.fn(async () => ({ order_id: "o1", replayed: true, ...totals })) });
    const res = await svc.placeOrder("u1", "key-12345678", { address_id: "a1" });
    expect(res.replayed).toBe(true);
    expect(repo.checkout).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "key-12345678", dryRun: false }));
  });

  it("presents orders with computed line totals and without the owner id for customers", async () => {
    const { svc } = make();
    const { order: o } = await svc.placeOrder("u1", "key-12345678", { address_id: "a1" });
    expect(o.items![0]!.line_total_paise).toBe(450);
    expect(o).not.toHaveProperty("user_id");
    expect(await svc.admin.get("o1")).toHaveProperty("user_id", "u1");
  });

  it("scopes customer reads to the user, and 404s others' orders", async () => {
    const { svc, repo } = make({ getForUser: vi.fn(async () => null) });
    await expect(svc.get("u2", "o1")).rejects.toMatchObject({ status: 404 });
    expect(repo.getForUser).toHaveBeenCalledWith("u2", "o1");
  });

  it("customer cancel is ownership-scoped inside the database call, then re-reads the order", async () => {
    const { svc, repo } = make();
    await svc.cancel("u1", "o1");
    expect(repo.cancel).toHaveBeenCalledWith("o1", "u1");
  });

  it("paginates lists with the requested page metadata", async () => {
    const { svc } = make();
    expect((await svc.list("u1", 2, 10)).meta).toEqual({ page: 2, pageSize: 10, total: 1 });
    expect((await svc.admin.list("pending", 1, 20)).meta).toEqual({ page: 1, pageSize: 20, total: 1 });
  });

  describe("admin status changes", () => {
    it("walks the happy path using optimistic updates from the current status", async () => {
      for (const [from, to] of [["pending", "confirmed"], ["confirmed", "packed"], ["packed", "out_for_delivery"], ["out_for_delivery", "delivered"]] as const) {
        const { svc, repo } = make({ getAny: vi.fn(async () => order({ status: from })) });
        await svc.admin.changeStatus("o1", to);
        expect(repo.transition).toHaveBeenCalledWith("o1", from, to);
      }
    });

    it("refuses illegal moves without touching the database", async () => {
      for (const [from, to] of [["pending", "packed"], ["pending", "delivered"], ["packed", "confirmed"], ["delivered", "confirmed"], ["cancelled", "confirmed"], ["delivered", "cancelled"], ["packed", "cancelled"]] as const) {
        const { svc, repo } = make({ getAny: vi.fn(async () => order({ status: from })) });
        await expect(svc.admin.changeStatus("o1", to), `${from} -> ${to}`).rejects.toMatchObject({ status: 409, code: "INVALID_TRANSITION" });
        expect(repo.transition).not.toHaveBeenCalled();
        expect(repo.cancel).not.toHaveBeenCalled();
      }
    });

    it("cancels through the stock-restoring function with no ownership scope; cancelling twice is fine", async () => {
      const { svc, repo } = make({ getAny: vi.fn(async () => order({ status: "confirmed" })) });
      await svc.admin.changeStatus("o1", "cancelled");
      expect(repo.cancel).toHaveBeenCalledWith("o1", null);
      const again = make({ getAny: vi.fn(async () => order({ status: "cancelled" })) });
      await expect(again.svc.admin.changeStatus("o1", "cancelled")).resolves.toBeDefined();
    });

    it("409s if the status changed underneath it, and 404s unknown orders", async () => {
      const { svc } = make({ transition: vi.fn(async () => false) });
      await expect(svc.admin.changeStatus("o1", "confirmed")).rejects.toMatchObject({ status: 409 });
      const missing = make({ getAny: vi.fn(async () => null) });
      await expect(missing.svc.admin.changeStatus("o1", "confirmed")).rejects.toMatchObject({ status: 404 });
    });
  });
});
