import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { supabaseAdmin } from "../../src/lib/supabase.js";

const anonKey = process.env.SUPABASE_ANON_KEY!;
const run = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const tag = Math.random().toString(36).slice(2, 8).toUpperCase();
const password = `Tmp-${run}-Aa1!`;
const app = createApp();

const userIds: Record<string, string> = {};
const tokens: Record<string, string> = {};
const clients: Record<string, SupabaseClient> = {};
const addressIds: Record<string, string> = {};
let unserviceableAddr = "";
const P: Record<string, string> = {};
const slug = `live-orders-${run}`;
const codes = { pct: `PCT${tag}`, lim: `LIM${tag}`, exp: `EXP${tag}` };

const as = (k: string, r: request.Test) => r.set("Authorization", `Bearer ${tokens[k]}`);
const stock = async (id: string) =>
  (await supabaseAdmin.from("products").select("stock_quantity").eq("id", id).single()).data!.stock_quantity as number;
const setCart = (u: string, pid: string, quantity: number) => as(u, request(app).put(`/api/v1/cart/items/${pid}`)).send({ quantity });
const clearCart = (u: string) => as(u, request(app).delete("/api/v1/cart"));
const place = (u: string, key: string, body: Record<string, unknown>) =>
  as(u, request(app).post("/api/v1/orders")).set("Idempotency-Key", key).send(body);
const ordersFor = async (u: string) =>
  (await supabaseAdmin.from("orders").select("id, status, idempotency_key").eq("user_id", userIds[u]!)).data ?? [];
const k = (n: string) => `${n}-${run}`;

async function makeUser(key: string, admin = false) {
  const email = `live-ord-${key}-${run}@example.com`;
  const { data, error } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  userIds[key] = data.user.id;
  if (admin) await supabaseAdmin.from("user_roles").insert({ user_id: data.user.id, role: "admin" });
  const c = createClient(env.SUPABASE_URL, anonKey, { auth: { persistSession: false } });
  const s = await c.auth.signInWithPassword({ email, password });
  if (s.error) throw s.error;
  tokens[key] = s.data.session.access_token;
  clients[key] = c;
}

beforeAll(async () => {
  await makeUser("a");
  await makeUser("b");
  await makeUser("admin", true);
  const cat = await supabaseAdmin.from("categories").insert({ slug, name: "Live orders" }).select("id").single();
  const mk = async (name: string, price: number, stockQty: number) => {
    const { data, error } = await supabaseAdmin.from("products").insert({
      category_id: cat.data!.id, sku: `LORD-${name}-${run}`, name: `Live ${name} ${run}`, unit_label: "1 pc",
      price_paise: price, mrp_paise: price + 1000, stock_quantity: stockQty,
    }).select("id").single();
    if (error) throw error;
    P[name] = data.id;
  };
  await mk("P1", 5000, 10);
  await mk("P2", 3000, 3);
  await mk("P3", 4000, 3);
  await mk("P4", 6000, 100);

  // Every column is given explicitly: bulk inserts fill omitted columns with NULL, not their defaults.
  const now = Date.now();
  const base = { max_discount_paise: null, min_order_paise: 0, usage_limit: null, per_user_limit: 1, is_active: true,
    starts_at: new Date(now - 60_000).toISOString(), expires_at: null };
  const coupons = await supabaseAdmin.from("coupons").insert([
    { ...base, code: codes.pct, discount_type: "percent", discount_value: 10, max_discount_paise: 500 },
    { ...base, code: codes.lim, discount_type: "flat", discount_value: 1000, usage_limit: 1 },
    { ...base, code: codes.exp, discount_type: "flat", discount_value: 1000,
      starts_at: new Date(now - 2 * 864e5).toISOString(), expires_at: new Date(now - 864e5).toISOString() },
  ]);
  if (coupons.error) throw coupons.error;

  for (const u of ["a", "b"]) {
    const r = await as(u, request(app).post("/api/v1/addresses")).send({ line1: "1 Live St", city: "Bengaluru", state: "KA", pincode: "560001" });
    addressIds[u] = r.body.data.id;
  }
  const bad = await as("a", request(app).post("/api/v1/addresses")).send({ line1: "2 Far St", city: "Nowhere", state: "XX", pincode: "999999" });
  unserviceableAddr = bad.body.data.id;
});

afterAll(async () => {
  const pids = Object.values(P);
  const uids = Object.values(userIds);
  if (pids.length) await supabaseAdmin.from("inventory_transactions").delete().in("product_id", pids);
  if (uids.length) await supabaseAdmin.from("orders").delete().in("user_id", uids); // cascades items + redemptions
  for (const id of uids) await supabaseAdmin.auth.admin.deleteUser(id);
  if (pids.length) await supabaseAdmin.from("products").delete().in("id", pids);
  await supabaseAdmin.from("coupons").delete().in("code", Object.values(codes));
  await supabaseAdmin.from("categories").delete().eq("slug", slug);
});

describe("quotes and validation (nothing is written)", () => {
  it("quote computes totals server-side and changes nothing", async () => {
    await setCart("a", P.P1!, 3);
    await setCart("a", P.P2!, 1);
    const q = await as("a", request(app).post("/api/v1/checkout/quote")).send({ address_id: addressIds.a });
    expect(q.status).toBe(200);
    expect(q.body.data).toEqual({ subtotal_paise: 18000, discount_paise: 0, delivery_fee_paise: 2500, total_paise: 20500 });
    expect(await stock(P.P1!)).toBe(10);
    expect(await ordersFor("a")).toHaveLength(0);
  });

  it("applies a percent coupon with its cap; rejects expired and unknown coupons", async () => {
    const ok = await as("a", request(app).post("/api/v1/checkout/quote")).send({ address_id: addressIds.a, coupon_code: codes.pct.toLowerCase() });
    expect(ok.body.data).toMatchObject({ discount_paise: 500, total_paise: 20000 }); // 10% of 18000 = 1800, capped at 500
    for (const code of [codes.exp, "NOPE123"]) {
      const bad = await as("a", request(app).post("/api/v1/checkout/quote")).send({ address_id: addressIds.a, coupon_code: code });
      expect(bad.status).toBe(422);
      expect(bad.body.error.code).toBe("COUPON_INVALID");
    }
  });

  it("rejects below-minimum, unserviceable, empty-cart and foreign-address checkouts", async () => {
    await clearCart("a");
    expect((await place("a", k("empty"), { address_id: addressIds.a })).body.error.code).toBe("CART_EMPTY");

    await setCart("a", P.P2!, 1); // 3000 < 9900 minimum
    const low = await place("a", k("low"), { address_id: addressIds.a });
    expect(low.status).toBe(422);
    expect(low.body.error.code).toBe("BELOW_MINIMUM_ORDER");

    await setCart("a", P.P1!, 3);
    const far = await place("a", k("far"), { address_id: unserviceableAddr });
    expect(far.body.error.code).toBe("PINCODE_NOT_SERVICEABLE");

    const foreign = await place("b", k("foreign"), { address_id: addressIds.a });
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe("ADDRESS_NOT_FOUND");

    expect(await ordersFor("a")).toHaveLength(0);
    expect(await stock(P.P1!)).toBe(10);
  });
});

describe("placing, replaying and snapshotting", () => {
  let orderId = "";
  it("creates an order, decrements stock, writes the ledger and empties the cart", async () => {
    const res = await place("a", k("K1"), { address_id: addressIds.a });
    expect(res.status).toBe(201);
    orderId = res.body.data.id;
    expect(res.body.data).toMatchObject({ status: "pending", subtotal_paise: 18000, total_paise: 20500 });
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.delivery_address).toMatchObject({ pincode: "560001", city: "Bengaluru" });
    expect(await stock(P.P1!)).toBe(7);
    expect(await stock(P.P2!)).toBe(2);
    const ledger = await supabaseAdmin.from("inventory_transactions").select("delta, reason").eq("order_id", orderId);
    expect(ledger.data!.map((l) => l.delta).sort((x, y) => x - y)).toEqual([-3, -1]);
    expect(ledger.data!.every((l) => l.reason === "order")).toBe(true);
    expect((await as("a", request(app).get("/api/v1/cart"))).body.data.items).toEqual([]);
  });

  it("replaying the same Idempotency-Key returns the same order and changes nothing", async () => {
    await setCart("a", P.P1!, 3);
    await setCart("a", P.P2!, 1);
    const again = await place("a", k("K1"), { address_id: addressIds.a });
    expect(again.status).toBe(200);
    expect(again.body.meta.replayed).toBe(true);
    expect(again.body.data.id).toBe(orderId);
    expect(await stock(P.P1!)).toBe(7);
    expect(await ordersFor("a")).toHaveLength(1);
    await clearCart("a");
  });

  it("order history is a snapshot: later price and name changes do not rewrite it", async () => {
    await supabaseAdmin.from("products").update({ price_paise: 9999, name: "Renamed" }).eq("id", P.P1!);
    const o = await as("a", request(app).get(`/api/v1/orders/${orderId}`));
    const item = o.body.data.items.find((i: { sku: string }) => i.sku === `LORD-P1-${run}`);
    expect(item).toMatchObject({ unit_price_paise: 5000, quantity: 3, name: `Live P1 ${run}` });
    await supabaseAdmin.from("products").update({ price_paise: 5000, name: `Live P1 ${run}` }).eq("id", P.P1!);
  });

  it("customer B cannot see, list or cancel customer A's order", async () => {
    expect((await as("b", request(app).get(`/api/v1/orders/${orderId}`))).status).toBe(404);
    expect((await as("b", request(app).get("/api/v1/orders"))).body.data).toEqual([]);
    expect((await as("b", request(app).post(`/api/v1/orders/${orderId}/cancel`))).status).toBe(404);
    expect((await as("a", request(app).get("/api/v1/orders"))).body.meta.total).toBe(1);
    expect((await supabaseAdmin.from("orders").select("status").eq("id", orderId).single()).data?.status).toBe("pending");
  });

  it("cancel restores stock exactly once, even if repeated", async () => {
    const c1 = await as("a", request(app).post(`/api/v1/orders/${orderId}/cancel`));
    expect(c1.status).toBe(200);
    expect(c1.body.data.status).toBe("cancelled");
    expect(await stock(P.P1!)).toBe(10);
    expect(await stock(P.P2!)).toBe(3);
    const c2 = await as("a", request(app).post(`/api/v1/orders/${orderId}/cancel`));
    expect(c2.status).toBe(200);
    expect(await stock(P.P1!)).toBe(10);
    const ledger = await supabaseAdmin.from("inventory_transactions").select("delta, reason").eq("order_id", orderId).eq("reason", "order_cancel");
    expect(ledger.data).toHaveLength(2);
  });
});

describe("coupons", () => {
  let first = "";
  it("per-user limit is enforced; cancelling releases the redemption", async () => {
    await setCart("a", P.P1!, 3);
    await setCart("a", P.P2!, 1);
    const o1 = await place("a", k("K2"), { address_id: addressIds.a, coupon_code: codes.pct });
    expect(o1.status).toBe(201);
    expect(o1.body.data).toMatchObject({ discount_paise: 500, total_paise: 20000 });
    first = o1.body.data.id;

    await setCart("a", P.P1!, 3);
    await setCart("a", P.P2!, 1);
    const dup = await place("a", k("K2b"), { address_id: addressIds.a, coupon_code: codes.pct });
    expect(dup.status).toBe(422);
    expect(dup.body.error.code).toBe("COUPON_ALREADY_USED");

    await as("a", request(app).post(`/api/v1/orders/${first}/cancel`));
    const again = await place("a", k("K3"), { address_id: addressIds.a, coupon_code: codes.pct });
    expect(again.status).toBe(201);
  });

  it("usage limit holds under concurrent checkouts (exactly one winner)", async () => {
    for (const u of ["a", "b"]) { await clearCart(u); await setCart(u, P.P4!, 2); }
    const [ra, rb] = await Promise.all([
      place("a", k("L-a"), { address_id: addressIds.a, coupon_code: codes.lim }),
      place("b", k("L-b"), { address_id: addressIds.b, coupon_code: codes.lim }),
    ]);
    const statuses = [ra.status, rb.status].sort();
    expect(statuses).toEqual([201, 422]);
    const loser = ra.status === 422 ? ra : rb;
    expect(loser.body.error.code).toBe("COUPON_EXHAUSTED");
    const coupon = await supabaseAdmin.from("coupons").select("id").eq("code", codes.lim).single();
    const redemptions = await supabaseAdmin.from("coupon_redemptions").select("id", { count: "exact", head: true }).eq("coupon_id", coupon.data!.id);
    expect(redemptions.count).toBe(1);
  });
});

describe("concurrency safety", () => {
  it("never oversells the last units: two buyers, stock for one", async () => {
    for (const u of ["a", "b"]) { await clearCart(u); await setCart(u, P.P3!, 3); } // 3 x 4000 = 12000
    const [ra, rb] = await Promise.all([
      place("a", k("R-a"), { address_id: addressIds.a }),
      place("b", k("R-b"), { address_id: addressIds.b }),
    ]);
    expect([ra.status, rb.status].sort()).toEqual([201, 409]);
    const loser = ra.status === 409 ? { r: ra, u: "a" } : { r: rb, u: "b" };
    expect(loser.r.body.error.code).toBe("INSUFFICIENT_STOCK");
    expect(await stock(P.P3!)).toBe(0);
    const ledger = await supabaseAdmin.from("inventory_transactions").select("delta").eq("product_id", P.P3!);
    expect(ledger.data!.reduce((s, r) => s + r.delta, 0)).toBe(-3);
    // The failed checkout rolled back completely: the loser still has their cart.
    expect((await as(loser.u, request(app).get("/api/v1/cart"))).body.data.item_count).toBe(3);
  });

  it("parallel double-submits with one key create exactly one order", async () => {
    await clearCart("a");
    await setCart("a", P.P4!, 2); // 12000
    const before = await stock(P.P4!);
    const results = await Promise.all(Array.from({ length: 6 }, () => place("a", k("D1"), { address_id: addressIds.a })));
    expect(results.every((r) => r.status === 201 || r.status === 200)).toBe(true);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(new Set(results.map((r) => r.body.data.id)).size).toBe(1);
    expect((await ordersFor("a")).filter((o) => o.idempotency_key === k("D1"))).toHaveLength(1);
    expect(await stock(P.P4!)).toBe(before - 2);
  });
});

describe("admin order management", () => {
  let orderId = "";
  it("customers cannot use admin order endpoints", async () => {
    expect((await as("a", request(app).get("/api/v1/admin/orders"))).status).toBe(403);
  });

  it("admin sees orders and moves one through the legal lifecycle only", async () => {
    orderId = (await ordersFor("a")).find((o) => o.idempotency_key === k("D1"))!.id;
    const list = await as("admin", request(app).get("/api/v1/admin/orders")).query({ status: "pending" });
    expect(list.status).toBe(200);
    expect(list.body.data.some((o: { id: string }) => o.id === orderId)).toBe(true);

    const set = (s: string) => as("admin", request(app).patch(`/api/v1/admin/orders/${orderId}/status`)).send({ status: s });
    expect((await set("packed")).status).toBe(409);          // cannot skip confirmed
    expect((await set("delivered")).status).toBe(409);
    expect((await set("confirmed")).status).toBe(200);
    expect((await set("packed")).status).toBe(200);
    const late = await as("a", request(app).post(`/api/v1/orders/${orderId}/cancel`));
    expect(late.status).toBe(409);                            // customers cannot cancel once packed
    expect(late.body.error.code).toBe("INVALID_TRANSITION");
    expect((await set("out_for_delivery")).status).toBe(200);
    expect((await set("delivered")).status).toBe(200);
    expect((await set("cancelled")).status).toBe(409);        // terminal
    expect((await set("confirmed")).status).toBe(409);
  });

  it("admin cancel restores stock", async () => {
    const o = (await ordersFor("a")).find((x) => x.idempotency_key === k("K3"))!; // coupon order from earlier, pending
    const p1 = await stock(P.P1!);
    const res = await as("admin", request(app).patch(`/api/v1/admin/orders/${o.id}/status`)).send({ status: "cancelled" });
    expect(res.status).toBe(200);
    expect(await stock(P.P1!)).toBe(p1 + 3);
  });
});

describe("direct database access is locked down", () => {
  it("clients can read only their own orders and cannot create or call checkout", async () => {
    const mine = await clients.a!.from("orders").select("user_id");
    expect(mine.data!.length).toBeGreaterThan(0);
    expect(mine.data!.every((r) => r.user_id === userIds.a)).toBe(true);
    expect((await clients.a!.from("orders").insert({ user_id: userIds.a })).error).not.toBeNull();
    expect((await clients.a!.from("orders").update({ status: "delivered" }).eq("user_id", userIds.a!)).error).not.toBeNull();
    const rpc = await clients.a!.rpc("checkout", { p_user_id: userIds.a, p_address_id: addressIds.a, p_idempotency_key: "direct-call-1" });
    expect(rpc.error).not.toBeNull();
    expect((await clients.a!.rpc("cancel_order", { p_order_id: "00000000-0000-0000-0000-000000000000" })).error).not.toBeNull();
  });
});

