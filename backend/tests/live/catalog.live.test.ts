import { createClient } from "@supabase/supabase-js";
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
const productIds: string[] = [];
let categoryId = "";
const slug = `live-cat-${run}`;

async function makeUser(key: string, admin: boolean) {
  const email = `live-${key}-${run}@example.com`;
  const { data, error } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  userIds.push(data.user.id);
  if (admin) await supabaseAdmin.from("user_roles").insert({ user_id: data.user.id, role: "admin" });
  const c = createClient(env.SUPABASE_URL, anonKey, { auth: { persistSession: false } });
  const s = await c.auth.signInWithPassword({ email, password });
  if (s.error) throw s.error;
  tokens[key] = s.data.session.access_token;
}
const as = (k: string, r: request.Test) => r.set("Authorization", `Bearer ${tokens[k]}`);

beforeAll(async () => {
  await makeUser("admin", true);
  await makeUser("cust", false);
});

afterAll(async () => {
  if (productIds.length) {
    await supabaseAdmin.from("inventory_transactions").delete().in("product_id", productIds);
    await supabaseAdmin.from("products").delete().in("id", productIds);
  }
  await supabaseAdmin.from("categories").delete().eq("slug", slug);
  for (const id of userIds) await supabaseAdmin.auth.admin.deleteUser(id);
});

describe("admin catalog management (real DB)", () => {
  it("customer cannot manage the catalog", async () => {
    expect((await as("cust", request(app).post("/api/v1/admin/categories")).send({ slug, name: "X" })).status).toBe(403);
  });

  it("admin creates a category, then a product with opening stock", async () => {
    const c = await as("admin", request(app).post("/api/v1/admin/categories")).send({ slug, name: "Live Test Cat" });
    expect(c.status).toBe(201);
    categoryId = c.body.data.id;

    const dup = await as("admin", request(app).post("/api/v1/admin/categories")).send({ slug, name: "Dup" });
    expect(dup.status).toBe(409);

    const p = await as("admin", request(app).post("/api/v1/admin/products")).send({
      category_id: categoryId, sku: `LIVE-${run}`, name: `Livemilk ${run}`, brand: "Test",
      unit_label: "1 L", price_paise: 6800, mrp_paise: 7000, initial_stock: 5,
    });
    expect(p.status).toBe(201);
    expect(p.body.data.stock_quantity).toBe(5);
    productIds.push(p.body.data.id);

    const dupSku = await as("admin", request(app).post("/api/v1/admin/products")).send({
      category_id: categoryId, sku: `LIVE-${run}`, name: "Other", unit_label: "1", price_paise: 1, mrp_paise: 1,
    });
    expect(dupSku.status).toBe(409);
  });

  it("public API lists, searches and fetches it without exposing stock", async () => {
    const list = await request(app).get("/api/v1/products").query({ category: slug });
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({ in_stock: true, price_paise: 6800 });
    expect(list.body.data[0]).not.toHaveProperty("stock_quantity");

    const search = await request(app).get("/api/v1/products").query({ q: `livemilk ${run}` });
    expect(search.body.meta.total).toBe(1);

    expect((await request(app).get(`/api/v1/products/${productIds[0]}`)).status).toBe(200);
    expect((await request(app).get("/api/v1/categories")).body.data.some((c: { slug: string }) => c.slug === slug)).toBe(true);
  });

  it("deactivated products disappear from the public API but stay in admin", async () => {
    const id = productIds[0]!;
    expect((await as("admin", request(app).patch(`/api/v1/admin/products/${id}`)).send({ is_active: false })).status).toBe(200);
    expect((await request(app).get(`/api/v1/products/${id}`)).status).toBe(404);
    expect((await request(app).get("/api/v1/products").query({ category: slug })).body.data).toHaveLength(0);
    const adminList = await as("admin", request(app).get("/api/v1/admin/products")).query({ q: `livemilk ${run}` });
    expect(adminList.body.data).toHaveLength(1);
    await as("admin", request(app).patch(`/api/v1/admin/products/${id}`)).send({ is_active: true });
  });

  it("DB constraints back up the API (mrp < price rejected by CHECK even if validation were bypassed)", async () => {
    const { error } = await supabaseAdmin.from("products").update({ mrp_paise: 1 }).eq("id", productIds[0]!);
    expect(error?.code).toBe("23514");
  });
});

describe("stock safety (real DB)", () => {
  it("never oversells under concurrent decrements", async () => {
    const id = productIds[0]!;
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        as("admin", request(app).post(`/api/v1/admin/products/${id}/stock`)).send({ delta: -1, reason: "adjustment" }),
      ),
    );
    const ok = results.filter((r) => r.status === 200).length;
    const rejected = results.filter((r) => r.status === 409).length;
    expect(ok).toBe(5); // stock was exactly 5
    expect(rejected).toBe(7);
    expect(results.find((r) => r.status === 409)!.body.error.code).toBe("INSUFFICIENT_STOCK");

    const { data } = await supabaseAdmin.from("products").select("stock_quantity").eq("id", id).single();
    expect(data?.stock_quantity).toBe(0);

    const { data: ledger } = await supabaseAdmin.from("inventory_transactions").select("delta").eq("product_id", id);
    expect(ledger?.reduce((s, r) => s + r.delta, 0)).toBe(0); // +5 opening, -5 adjustments
  });

  it("returns 404 for an unknown product and blocks clients from calling the RPC", async () => {
    const res = await as("admin", request(app).post("/api/v1/admin/products/99999999-9999-4999-8999-999999999999/stock"))
      .send({ delta: 1, reason: "restock" });
    expect(res.status).toBe(404);

    const c = createClient(env.SUPABASE_URL, anonKey, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email: `live-cust-${run}@example.com`, password });
    const rpc = await c.rpc("adjust_stock", { p_product_id: productIds[0], p_delta: 100, p_reason: "restock" });
    expect(rpc.error).not.toBeNull();
  });
});


