import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { AddressRepository } from "../src/repositories/address.repository.js";
import type { CartRepository } from "../src/repositories/cart.repository.js";
import type { Address, CartLineRow } from "../src/types/commerce.js";

const PID = "11111111-1111-4111-8111-111111111111";
const addr = (o: Partial<Address> = {}): Address => ({
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", user_id: "u1", label: "Home", line1: "1 St", line2: null,
  landmark: null, city: "Bengaluru", state: "KA", pincode: "560001", is_default: true, ...o,
});

function repos(count = 0, lines: CartLineRow[] = []) {
  const a = {
    list: vi.fn(async () => [addr()]), count: vi.fn(async () => count),
    create: vi.fn(async (u, i) => addr({ user_id: u, ...i })), update: vi.fn(async (u, id, p) => addr({ id, user_id: u, ...p })),
    remove: vi.fn(async () => undefined), setDefault: vi.fn(async () => true),
    findPincode: vi.fn(async (p: string) => p === "560001"
      ? { pincode: p, area_name: "MG Road", city: "Bengaluru", delivery_fee_paise: 2500, min_order_paise: 9900, is_active: true } : null),
  };
  const c = {
    getLines: vi.fn(async () => lines),
    getProductForCart: vi.fn(async (id: string) => (id === PID ? { id, stock_quantity: 5, is_active: true } : null)),
    setQuantity: vi.fn(async () => undefined), removeItem: vi.fn(async () => undefined), clear: vi.fn(async () => undefined),
  };
  return { a, c };
}
const line = (o: Partial<CartLineRow["product"]> = {}, quantity = 2): CartLineRow => ({
  product_id: PID, quantity,
  product: { id: PID, name: "Milk", unit_label: "1 L", price_paise: 6800, mrp_paise: 7000, stock_quantity: 10, image_path: null, is_active: true, ...o },
});
const build = (count = 0, lines: CartLineRow[] = []) => {
  const r = repos(count, lines);
  const app = createApp({
    verifyToken: async (t) => { if (t === "u1" || t === "u2") return { userId: t }; throw new Error("bad"); },
    isAdmin: async () => false,
    addresses: r.a as unknown as AddressRepository, cart: r.c as unknown as CartRepository,
  });
  return { app, ...r };
};
const as = (t: string, r: request.Test) => r.set("Authorization", `Bearer ${t}`);
const validAddr = { line1: "12 MG Road", city: "Bengaluru", state: "Karnataka", pincode: "560001" };

describe("auth required", () => {
  const { app } = build();
  it.each([["get", "/api/v1/addresses"], ["post", "/api/v1/addresses"], ["get", "/api/v1/cart"],
    ["delete", "/api/v1/cart"], ["put", `/api/v1/cart/items/${PID}`]] as const)("%s %s -> 401", async (m, p) => {
    expect((await request(app)[m](p)).status).toBe(401);
  });
});

describe("serviceability", () => {
  const { app } = build();
  it("reports serviceable and unserviceable pincodes publicly", async () => {
    const ok = await request(app).get("/api/v1/serviceability/560001");
    expect(ok.body.data).toMatchObject({ serviceable: true, delivery_fee_paise: 2500 });
    expect((await request(app).get("/api/v1/serviceability/999999")).body.data).toEqual({ pincode: "999999", serviceable: false });
    expect((await request(app).get("/api/v1/serviceability/12ab")).status).toBe(400);
  });
});

describe("addresses", () => {
  it("scopes by the token user, ignoring any user_id in the body", async () => {
    const { app, a } = build(1);
    expect((await as("u1", request(app).post("/api/v1/addresses")).send({ ...validAddr, user_id: "u2" })).status).toBe(400);
    expect((await as("u1", request(app).post("/api/v1/addresses")).send(validAddr)).status).toBe(201);
    expect(a.create).toHaveBeenCalledWith("u1", expect.any(Object));
    await as("u2", request(app).delete(`/api/v1/addresses/${addr().id}`));
    expect(a.remove).toHaveBeenCalledWith("u2", addr().id);
  });
  it("makes the first address default, but not later ones", async () => {
    const first = build(0);
    await as("u1", request(first.app).post("/api/v1/addresses")).send(validAddr);
    expect(first.a.create).toHaveBeenCalledWith("u1", expect.objectContaining({ is_default: true }));
    const later = build(2);
    await as("u1", request(later.app).post("/api/v1/addresses")).send(validAddr);
    expect(later.a.create).toHaveBeenCalledWith("u1", expect.not.objectContaining({ is_default: true }));
  });
  it("caps addresses at 10", async () => {
    const { app } = build(10);
    expect((await as("u1", request(app).post("/api/v1/addresses")).send(validAddr)).status).toBe(400);
  });
  it("validates input", async () => {
    const { app } = build();
    for (const body of [{ ...validAddr, pincode: "0123456" }, { ...validAddr, pincode: "012345" }, { ...validAddr, line1: "" }, {}]) {
      expect((await as("u1", request(app).post("/api/v1/addresses")).send(body)).status).toBe(400);
    }
    const url = `/api/v1/addresses/${addr().id}`;
    expect((await as("u1", request(app).patch(url)).send({})).status).toBe(400);
    expect((await as("u1", request(app).patch(url)).send({ is_default: false })).status).toBe(400);
    expect((await as("u1", request(app).patch(url)).send({ user_id: "u2" })).status).toBe(400);
    expect((await as("u1", request(app).patch("/api/v1/addresses/nope")).send({ label: "x" })).status).toBe(400);
  });
});

describe("cart", () => {
  it("prices from the server, ignores client prices, totals in integer paise", async () => {
    const { app } = build(0, [line(), line({ name: "Gone", is_active: false }), line({ stock_quantity: 1 }, 3)]);
    const res = await as("u1", request(app).get("/api/v1/cart"));
    const d = res.body.data;
    expect(d.items[0]).toMatchObject({ line_total_paise: 13600, purchasable: true, issue: null });
    expect(d.items[1]).toMatchObject({ purchasable: false, issue: "unavailable" });
    expect(d.items[2]).toMatchObject({ purchasable: false, issue: "insufficient_stock", available_quantity: 1 });
    expect(d.subtotal_paise).toBe(13600); // only purchasable lines count
    expect(d.item_count).toBe(7);
  });
  it("sets quantity with stock check and strict validation", async () => {
    const { app, c } = build();
    const url = `/api/v1/cart/items/${PID}`;
    expect((await as("u1", request(app).put(url)).send({ quantity: 3 })).status).toBe(200);
    expect(c.setQuantity).toHaveBeenCalledWith("u1", PID, 3);
    const over = await as("u1", request(app).put(url)).send({ quantity: 6 });
    expect(over.status).toBe(409);
    expect(over.body.error).toMatchObject({ code: "INSUFFICIENT_STOCK", details: { available_quantity: 5 } });
    for (const body of [{ quantity: 0 }, { quantity: 51 }, { quantity: 1.5 }, { quantity: 2, price_paise: 1 }, {}]) {
      expect((await as("u1", request(app).put(url)).send(body)).status).toBe(400);
    }
    expect((await as("u1", request(app).put("/api/v1/cart/items/22222222-2222-4222-8222-222222222222")).send({ quantity: 1 })).status).toBe(404);
  });
});
