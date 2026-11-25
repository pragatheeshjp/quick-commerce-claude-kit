import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { AddressRepository } from "../src/repositories/address.repository.js";
import type { CartRepository } from "../src/repositories/cart.repository.js";
import type { CatalogRepository } from "../src/repositories/catalog.repository.js";
import type { OrderRepository } from "../src/repositories/order.repository.js";

const UID = "11111111-1111-4111-8111-111111111111";
const category = { id: UID, parent_id: null, slug: "dairy", name: "Dairy", image_path: null, sort_order: 0, is_active: true };
const product = { id: UID, category_id: UID, sku: "S", name: "Milk", description: null, brand: null, unit_label: "1 L", price_paise: 6800, mrp_paise: 7000, stock_quantity: 4, image_path: null, is_active: true };
const address = { id: UID, user_id: "customer", label: "Home", line1: "x", line2: null, landmark: null, city: "c", state: "s", pincode: "560001", is_default: true };
const order = { id: UID, user_id: "customer", status: "pending", delivery_address: {}, subtotal_paise: 100, discount_paise: 0, delivery_fee_paise: 0, total_paise: 100, created_at: "t", order_items: [] };
const totals = { subtotal_paise: 100, discount_paise: 0, delivery_fee_paise: 0, total_paise: 100 };

const catalog = {
  listCategories: vi.fn(), createCategory: vi.fn(), updateCategory: vi.fn(), listProducts: vi.fn(), getProduct: vi.fn(),
  createProduct: vi.fn(), updateProduct: vi.fn(), adjustStock: vi.fn(),
};
const cart = { getLines: vi.fn(), getProductForCart: vi.fn(), setQuantity: vi.fn(), removeItem: vi.fn(), clear: vi.fn() };
const addresses = { list: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), setDefault: vi.fn(), findPincode: vi.fn() };
const orders = { checkout: vi.fn(), listForUser: vi.fn(), getForUser: vi.fn(), cancel: vi.fn(), listAll: vi.fn(), getAny: vi.fn(), transition: vi.fn() };

const app = createApp({
  verifyToken: async (t) => { if (t === "customer" || t === "admin") return { userId: t }; throw new Error("bad"); },
  isAdmin: async (id) => id === "admin",
  catalog: catalog as unknown as CatalogRepository, cart: cart as unknown as CartRepository,
  addresses: addresses as unknown as AddressRepository, orders: orders as unknown as OrderRepository,
});
const as = (t: string, r: request.Test) => r.set("Authorization", `Bearer ${t}`);

beforeEach(() => {
  for (const group of [catalog, cart, addresses, orders]) for (const fn of Object.values(group)) fn.mockReset();
});

describe("public catalog routes", () => {
  it("GET /categories lists active categories", async () => {
    catalog.listCategories.mockResolvedValue([category]);
    const res = await request(app).get("/api/v1/categories");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [category] });
    expect(catalog.listCategories).toHaveBeenCalledWith(false);
  });

  it("GET /products/:id returns the public shape (no stock)", async () => {
    catalog.getProduct.mockResolvedValue(product);
    const res = await request(app).get(`/api/v1/products/${UID}`);
    expect(res.body.data).toMatchObject({ id: UID, in_stock: true });
    expect(res.body.data).not.toHaveProperty("stock_quantity");
  });

  it("GET /serviceability/:pincode needs no login", async () => {
    addresses.findPincode.mockResolvedValue({ pincode: "560001", area_name: "MG Road", city: "B", delivery_fee_paise: 2500, min_order_paise: 9900, is_active: true });
    const res = await request(app).get("/api/v1/serviceability/560001");
    expect(res.body.data).toMatchObject({ serviceable: true, delivery_fee_paise: 2500 });
  });
});

describe("address routes (always the token's user)", () => {
  it("lists, updates and deletes only that user's addresses", async () => {
    addresses.list.mockResolvedValue([address]);
    expect((await as("customer", request(app).get("/api/v1/addresses"))).body.data).toEqual([address]);
    expect(addresses.list).toHaveBeenCalledWith("customer");

    addresses.update.mockResolvedValue({ ...address, label: "Work" });
    const patched = await as("customer", request(app).patch(`/api/v1/addresses/${UID}`)).send({ label: "Work" });
    expect(patched.body.data.label).toBe("Work");
    expect(addresses.update).toHaveBeenCalledWith("customer", UID, { label: "Work" });

    const del = await as("customer", request(app).delete(`/api/v1/addresses/${UID}`));
    expect(del.status).toBe(204);
    expect(del.text).toBe("");
    expect(addresses.remove).toHaveBeenCalledWith("customer", UID);
  });
});

describe("cart routes", () => {
  const line = { product_id: UID, quantity: 2, product: { id: UID, name: "Milk", unit_label: "1 L", price_paise: 6800, mrp_paise: 7000, stock_quantity: 10, image_path: null, is_active: true } };

  it("GET /cart returns the server-priced view", async () => {
    cart.getLines.mockResolvedValue([line]);
    const res = await as("customer", request(app).get("/api/v1/cart"));
    expect(res.body.data).toMatchObject({ item_count: 2, subtotal_paise: 13600 });
    expect(cart.getLines).toHaveBeenCalledWith("customer");
  });

  it("PUT, DELETE item and DELETE cart act for the token's user and return the fresh cart", async () => {
    cart.getLines.mockResolvedValue([]);
    cart.getProductForCart.mockResolvedValue({ id: UID, stock_quantity: 5, is_active: true });
    expect((await as("customer", request(app).put(`/api/v1/cart/items/${UID}`)).send({ quantity: 2 })).status).toBe(200);
    expect(cart.setQuantity).toHaveBeenCalledWith("customer", UID, 2);
    expect((await as("customer", request(app).delete(`/api/v1/cart/items/${UID}`))).status).toBe(200);
    expect(cart.removeItem).toHaveBeenCalledWith("customer", UID);
    expect((await as("customer", request(app).delete("/api/v1/cart"))).body.data).toEqual({ items: [], item_count: 0, subtotal_paise: 0 });
    expect(cart.clear).toHaveBeenCalledWith("customer");
  });
});

describe("order routes", () => {
  it("lists the customer's orders with pagination meta", async () => {
    orders.listForUser.mockResolvedValue({ items: [{ ...order, order_items: undefined }], total: 11 });
    const res = await as("customer", request(app).get("/api/v1/orders?page=2&pageSize=5"));
    expect(res.body.meta).toEqual({ page: 2, pageSize: 5, total: 11 });
    expect(orders.listForUser).toHaveBeenCalledWith("customer", 2, 5);
    expect(res.body.data[0]).not.toHaveProperty("user_id");
  });

  it("fetches one order and cancels it for the token's user", async () => {
    orders.getForUser.mockResolvedValue(order);
    expect((await as("customer", request(app).get(`/api/v1/orders/${UID}`))).body.data.id).toBe(UID);
    const res = await as("customer", request(app).post(`/api/v1/orders/${UID}/cancel`));
    expect(res.status).toBe(200);
    expect(orders.cancel).toHaveBeenCalledWith(UID, "customer");
  });

  it("quotes without creating anything", async () => {
    orders.checkout.mockResolvedValue({ order_id: null, replayed: false, ...totals });
    const res = await as("customer", request(app).post("/api/v1/checkout/quote")).send({ address_id: UID });
    expect(res.body.data).toEqual(totals);
    expect(orders.checkout).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true, userId: "customer" }));
  });
});

describe("admin catalog routes", () => {
  it("lists categories including inactive ones", async () => {
    catalog.listCategories.mockResolvedValue([{ ...category, is_active: false }]);
    const res = await as("admin", request(app).get("/api/v1/admin/categories"));
    expect(res.body.data[0].is_active).toBe(false);
    expect(catalog.listCategories).toHaveBeenCalledWith(true);
  });

  it("creates (201) and updates categories with validated bodies", async () => {
    catalog.createCategory.mockImplementation(async (i: object) => ({ ...category, ...i }));
    const created = await as("admin", request(app).post("/api/v1/admin/categories")).send({ slug: "fresh-fruit", name: "Fresh fruit" });
    expect(created.status).toBe(201);
    expect(catalog.createCategory).toHaveBeenCalledWith({ slug: "fresh-fruit", name: "Fresh fruit" });
    catalog.updateCategory.mockImplementation(async (_id: string, p: object) => ({ ...category, ...p }));
    const updated = await as("admin", request(app).patch(`/api/v1/admin/categories/${UID}`)).send({ is_active: false });
    expect(updated.body.data.is_active).toBe(false);
    expect((await as("admin", request(app).patch(`/api/v1/admin/categories/${UID}`)).send({})).status).toBe(400);
  });

  it("lists products (inactive included by default) and honours includeInactive=false", async () => {
    catalog.listProducts.mockResolvedValue({ items: [product], total: 1 });
    const all = await as("admin", request(app).get("/api/v1/admin/products?q=milk"));
    expect(all.body.data[0]).toHaveProperty("stock_quantity", 4);
    expect(catalog.listProducts).toHaveBeenLastCalledWith(expect.objectContaining({ includeInactive: true, q: "milk" }));
    await as("admin", request(app).get("/api/v1/admin/products?includeInactive=false"));
    expect(catalog.listProducts).toHaveBeenLastCalledWith(expect.objectContaining({ includeInactive: false }));
  });

  it("patches a product and adjusts stock, reporting the acting admin", async () => {
    catalog.updateProduct.mockImplementation(async (_id: string, p: object) => ({ ...product, ...p }));
    expect((await as("admin", request(app).patch(`/api/v1/admin/products/${UID}`)).send({ price_paise: 5000 })).body.data.price_paise).toBe(5000);
    catalog.adjustStock.mockResolvedValue(9);
    const res = await as("admin", request(app).post(`/api/v1/admin/products/${UID}/stock`)).send({ delta: 5, reason: "restock" });
    expect(res.body.data).toEqual({ id: UID, stock_quantity: 9 });
    expect(catalog.adjustStock).toHaveBeenCalledWith(UID, 5, "restock", "admin");
  });
});

describe("admin order routes", () => {
  it("lists orders with a status filter and rejects unknown statuses", async () => {
    orders.listAll.mockResolvedValue({ items: [order], total: 1 });
    const res = await as("admin", request(app).get("/api/v1/admin/orders?status=pending&page=2"));
    expect(res.body.data[0]).toHaveProperty("user_id", "customer");
    expect(orders.listAll).toHaveBeenCalledWith("pending", 2, 20);
    expect((await as("admin", request(app).get("/api/v1/admin/orders?status=shipped"))).status).toBe(400);
  });

  it("gets one order and changes its status", async () => {
    orders.getAny.mockResolvedValue(order);
    orders.transition.mockResolvedValue(true);
    expect((await as("admin", request(app).get(`/api/v1/admin/orders/${UID}`))).status).toBe(200);
    const res = await as("admin", request(app).patch(`/api/v1/admin/orders/${UID}/status`)).send({ status: "confirmed" });
    expect(res.status).toBe(200);
    expect(orders.transition).toHaveBeenCalledWith(UID, "pending", "confirmed");
  });

  it("the admin ping endpoint confirms the role", async () => {
    expect((await as("admin", request(app).get("/api/v1/admin/ping"))).body.data).toEqual({ admin: true });
  });
});
