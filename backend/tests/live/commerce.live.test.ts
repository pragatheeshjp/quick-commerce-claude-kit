import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { supabaseAdmin } from "../../src/lib/supabase.js";

const anonKey = process.env.SUPABASE_ANON_KEY!;
const run = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const password = `Tmp-${run}-Aa1!`;
const app = createApp();
const userIds: string[] = [];
const tokens: Record<string, string> = {};
const clients: Record<string, SupabaseClient> = {};
let categoryId = "";
let productId = "";
const slug = `live-shop-${run}`;

async function makeUser(key: string) {
  const email = `live-${key}-${run}@example.com`;
  const { data, error } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  userIds.push(data.user.id);
  const c = createClient(env.SUPABASE_URL, anonKey, { auth: { persistSession: false } });
  const s = await c.auth.signInWithPassword({ email, password });
  if (s.error) throw s.error;
  tokens[key] = s.data.session.access_token;
  clients[key] = c;
}
const as = (k: string, r: request.Test) => r.set("Authorization", `Bearer ${tokens[k]}`);
const addr = (n: number) => ({ line1: `${n} Test Street`, city: "Bengaluru", state: "Karnataka", pincode: "560001" });

beforeAll(async () => {
  await makeUser("a");
  await makeUser("b");
  const cat = await supabaseAdmin.from("categories").insert({ slug, name: "Live shop" }).select("id").single();
  categoryId = cat.data!.id;
  const p = await supabaseAdmin.from("products").insert({
    category_id: categoryId, sku: `LIVESHOP-${run}`, name: "Live Item", unit_label: "1 pc",
    price_paise: 5000, mrp_paise: 6000, stock_quantity: 5,
  }).select("id").single();
  productId = p.data!.id;
});

afterAll(async () => {
  for (const id of userIds) await supabaseAdmin.auth.admin.deleteUser(id); // cascades addresses, carts, cart_items
  await supabaseAdmin.from("products").delete().eq("id", productId);
  await supabaseAdmin.from("categories").delete().eq("slug", slug);
});

describe("serviceability (seed data)", () => {
  it("knows seeded pincodes", async () => {
    const ok = await request(app).get("/api/v1/serviceability/560001");
    expect(ok.body.data).toMatchObject({ serviceable: true, city: "Bengaluru" });
    expect((await request(app).get("/api/v1/serviceability/999999")).body.data.serviceable).toBe(false);
  });
});

describe("addresses (real DB)", () => {
  const ids: string[] = [];
  it("first address is default; later ones are not; exactly one default at all times", async () => {
    const a1 = await as("a", request(app).post("/api/v1/addresses")).send(addr(1));
    const a2 = await as("a", request(app).post("/api/v1/addresses")).send(addr(2));
    expect(a1.status).toBe(201);
    expect(a1.body.data.is_default).toBe(true);
    expect(a2.body.data.is_default).toBe(false);
    ids.push(a1.body.data.id, a2.body.data.id);

    const sw = await as("a", request(app).patch(`/api/v1/addresses/${ids[1]}`)).send({ is_default: true });
    expect(sw.status).toBe(200);
    expect(sw.body.data.is_default).toBe(true);
    const list = await as("a", request(app).get("/api/v1/addresses"));
    expect(list.body.data.filter((x: { is_default: boolean }) => x.is_default).map((x: { id: string }) => x.id)).toEqual([ids[1]]);
  });

  it("customer B cannot see, edit or delete customer A's addresses", async () => {
    expect((await as("b", request(app).get("/api/v1/addresses"))).body.data).toEqual([]);
    expect((await as("b", request(app).patch(`/api/v1/addresses/${ids[0]}`)).send({ label: "Hacked" })).status).toBe(404);
    expect((await as("b", request(app).patch(`/api/v1/addresses/${ids[0]}`)).send({ is_default: true })).status).toBe(404);
    expect((await as("b", request(app).delete(`/api/v1/addresses/${ids[0]}`))).status).toBe(404);
    const { data } = await supabaseAdmin.from("addresses").select("label").eq("id", ids[0]!).single();
    expect(data?.label).toBe("Home");
  });

  it("B cannot hijack A's default via the RPC directly either", async () => {
    const rpc = await clients.b!.rpc("set_default_address", { p_user_id: userIds[0], p_address_id: ids[0] });
    expect(rpc.error).not.toBeNull();
  });

  it("owner can edit and delete", async () => {
    expect((await as("a", request(app).patch(`/api/v1/addresses/${ids[0]}`)).send({ label: "Work" })).body.data.label).toBe("Work");
    expect((await as("a", request(app).delete(`/api/v1/addresses/${ids[0]}`))).status).toBe(204);
  });

  it("enforces the 10-address cap", async () => {
    for (let i = 0; i < 9; i++) await as("a", request(app).post("/api/v1/addresses")).send(addr(10 + i));
    expect((await as("a", request(app).post("/api/v1/addresses")).send(addr(99))).status).toBe(400);
  });
});

describe("cart (real DB)", () => {
  const url = () => `/api/v1/cart/items/${productId}`;

  it("adds an item priced by the server and rejects over-stock quantities", async () => {
    const ok = await as("a", request(app).put(url())).send({ quantity: 2 });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ item_count: 2, subtotal_paise: 10000 });
    expect(ok.body.data.items[0]).toMatchObject({ unit_price_paise: 5000, line_total_paise: 10000, purchasable: true });

    const over = await as("a", request(app).put(url())).send({ quantity: 6 });
    expect(over.status).toBe(409);
    expect(over.body.error.details.available_quantity).toBe(5);
  });

  it("setting quantity again replaces it (no duplicate lines)", async () => {
    const res = await as("a", request(app).put(url())).send({ quantity: 4 });
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.item_count).toBe(4);
  });

  it("customer B's cart is separate and B cannot touch A's items", async () => {
    expect((await as("b", request(app).get("/api/v1/cart"))).body.data.items).toEqual([]);
    expect((await as("b", request(app).delete(url()))).status).toBe(404);
    expect((await as("a", request(app).get("/api/v1/cart"))).body.data.item_count).toBe(4);
  });

  it("reflects price changes immediately and flags stock/availability issues", async () => {
    await supabaseAdmin.from("products").update({ price_paise: 5500 }).eq("id", productId);
    let c = (await as("a", request(app).get("/api/v1/cart"))).body.data;
    expect(c.subtotal_paise).toBe(22000);

    await supabaseAdmin.from("products").update({ stock_quantity: 2 }).eq("id", productId);
    c = (await as("a", request(app).get("/api/v1/cart"))).body.data;
    expect(c.items[0]).toMatchObject({ purchasable: false, issue: "insufficient_stock", available_quantity: 2 });
    expect(c.subtotal_paise).toBe(0);

    await supabaseAdmin.from("products").update({ is_active: false }).eq("id", productId);
    c = (await as("a", request(app).get("/api/v1/cart"))).body.data;
    expect(c.items[0].issue).toBe("unavailable");
    expect((await as("a", request(app).put(url())).send({ quantity: 1 })).status).toBe(404);
  });

  it("removes items and clears the cart", async () => {
    const removed = await as("a", request(app).delete(url()));
    expect(removed.status).toBe(200);
    expect(removed.body.data.items).toEqual([]);
    expect((await as("a", request(app).delete("/api/v1/cart"))).status).toBe(200);
  });

  it("clients cannot read or write carts directly through the Supabase API", async () => {
    expect((await clients.b!.from("cart_items").insert({ cart_id: "00000000-0000-0000-0000-000000000000", product_id: productId, quantity: 1 })).error).not.toBeNull();
  });
});


