import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { supabaseAdmin } from "../../src/lib/supabase.js";

const anonKey = process.env.SUPABASE_ANON_KEY!;
const run = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const password = `Tmp-${run}-Aa1!`;
const emails = { a: `live-a-${run}@example.com`, b: `live-b-${run}@example.com` };
const ids: Record<string, string> = {};
const tokens: Record<string, string> = {};
const clients: Record<string, SupabaseClient> = {};
const anon = createClient(env.SUPABASE_URL, anonKey, { auth: { persistSession: false } });

beforeAll(async () => {
  for (const k of ["a", "b"] as const) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: emails[k], password, email_confirm: true, user_metadata: { full_name: `Live ${k}` },
    });
    if (error) throw error;
    ids[k] = data.user.id;
    const c = createClient(env.SUPABASE_URL, anonKey, { auth: { persistSession: false } });
    const s = await c.auth.signInWithPassword({ email: emails[k], password });
    if (s.error) throw s.error;
    tokens[k] = s.data.session.access_token;
    clients[k] = c;
  }
  const { error } = await supabaseAdmin.from("addresses").insert({
    user_id: ids.a, line1: "1 Test St", city: "Bengaluru", state: "KA", pincode: "560001",
  });
  if (error) throw error;
});

afterAll(async () => {
  for (const id of Object.values(ids)) await supabaseAdmin.auth.admin.deleteUser(id);
});

describe("signup trigger", () => {
  it("creates a profile row for new users", async () => {
    const { data } = await supabaseAdmin.from("profiles").select("full_name").eq("id", ids.a!).single();
    expect(data?.full_name).toBe("Live a");
  });
});

describe("RLS isolation", () => {
  it("owner sees own address; other user sees none", async () => {
    expect((await clients.a!.from("addresses").select("*")).data).toHaveLength(1);
    expect((await clients.b!.from("addresses").select("*")).data).toHaveLength(0);
  });
  it("users only see their own profile", async () => {
    const { data } = await clients.a!.from("profiles").select("id");
    expect(data?.map((r) => r.id)).toEqual([ids.a]);
  });
  it("clients cannot write addresses, orders, products, coupons", async () => {
    const addr = await clients.b!.from("addresses").insert({
      user_id: ids.b, line1: "x", city: "c", state: "s", pincode: "560001",
    });
    expect(addr.error).not.toBeNull();
    expect((await clients.b!.from("products").update({ price_paise: 1 }).neq("sku", "")).error).not.toBeNull();
    expect((await clients.b!.from("coupons").select("*")).error).not.toBeNull();
    expect((await clients.b!.from("orders").insert({})).error).not.toBeNull();
  });
  it("anon cannot read private tables but can read the catalog", async () => {
    expect((await anon.from("profiles").select("*")).error).not.toBeNull();
    expect((await anon.from("orders").select("*")).error).not.toBeNull();
    expect((await anon.from("products").select("sku")).error).toBeNull();
  });
});

describe("self-promotion", () => {
  it("users cannot insert, read others', or edit roles", async () => {
    expect((await clients.a!.from("user_roles").insert({ user_id: ids.a, role: "admin" })).error).not.toBeNull();
    expect((await clients.a!.from("user_roles").select("*")).data).toEqual([]);
    expect((await clients.a!.from("profiles").update({ role: "admin" } as never).eq("id", ids.a!)).error).not.toBeNull();
  });
});

describe("Express with real Supabase tokens", () => {
  const app = createApp();
  it("rejects missing and garbage tokens", async () => {
    expect((await request(app).get("/api/v1/me")).status).toBe(401);
    expect((await request(app).get("/api/v1/me").set("Authorization", "Bearer abc.def.ghi")).status).toBe(401);
  });
  it("rejects the anon key (not a user token)", async () => {
    expect((await request(app).get("/api/v1/me").set("Authorization", `Bearer ${anonKey}`)).status).toBe(401);
  });
  it("/me returns the verified user as customer", async () => {
    const res = await request(app).get("/api/v1/me").set("Authorization", `Bearer ${tokens.a}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: ids.a, role: "customer", email: emails.a });
  });
  it("customer is forbidden from admin; granted admin via service role is allowed", async () => {
    const get = (k: string) => request(app).get("/api/v1/admin/ping").set("Authorization", `Bearer ${tokens[k]}`);
    expect((await get("a")).status).toBe(403);
    await supabaseAdmin.from("user_roles").insert({ user_id: ids.a, role: "admin" });
    expect((await get("a")).status).toBe(200);
    expect((await get("b")).status).toBe(403);
  });
});

