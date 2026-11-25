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
const ids: Record<string, string> = {};
const emails: Record<string, string> = {};
const tokens: Record<string, string> = {};
const clients: Record<string, SupabaseClient> = {};

async function makeUser(key: string, admin = false) {
  emails[key] = `live-adm-${key}-${run}@example.com`;
  const { data, error } = await supabaseAdmin.auth.admin.createUser({ email: emails[key]!, password, email_confirm: true });
  if (error) throw error;
  ids[key] = data.user.id;
  if (admin) await supabaseAdmin.from("user_roles").insert({ user_id: data.user.id, role: "admin" });
  const c = createClient(env.SUPABASE_URL, anonKey, { auth: { persistSession: false } });
  const s = await c.auth.signInWithPassword({ email: emails[key]!, password });
  if (s.error) throw s.error;
  tokens[key] = s.data.session.access_token;
  clients[key] = c;
}
const as = (k: string, r: request.Test) => r.set("Authorization", `Bearer ${tokens[k]}`);
const ping = (k: string) => as(k, request(app).get("/api/v1/admin/ping"));

beforeAll(async () => {
  await makeUser("a", true);
  await makeUser("b");
  await makeUser("c");
});

afterAll(async () => {
  for (const id of Object.values(ids)) await supabaseAdmin.auth.admin.deleteUser(id); // cascades roles
});

describe("admin management (real DB)", () => {
  it("customers cannot list, grant or revoke", async () => {
    expect((await as("c", request(app).get("/api/v1/admin/admins"))).status).toBe(403);
    expect((await as("c", request(app).post("/api/v1/admin/admins")).send({ email: emails.c })).status).toBe(403);
    expect((await as("c", request(app).delete(`/api/v1/admin/admins/${ids.a}`))).status).toBe(403);
    expect((await ping("c")).status).toBe(403);
  });

  it("an admin grants another user by email (case-insensitive) and it takes effect immediately", async () => {
    expect((await ping("b")).status).toBe(403);
    const res = await as("a", request(app).post("/api/v1/admin/admins")).send({ email: emails.b!.toUpperCase() });
    expect(res.status).toBe(201);
    expect(res.body.data.user_id).toBe(ids.b);
    expect((await ping("b")).status).toBe(200);
  });

  it("granting twice is harmless", async () => {
    const again = await as("a", request(app).post("/api/v1/admin/admins")).send({ email: emails.b });
    expect(again.status).toBe(201);
    const list = await as("a", request(app).get("/api/v1/admin/admins"));
    expect(list.body.data.filter((x: { user_id: string }) => x.user_id === ids.b)).toHaveLength(1);
    expect(list.body.data.some((x: { email: string }) => x.email === emails.a)).toBe(true);
  });

  it("unknown emails are rejected without creating anything", async () => {
    const res = await as("a", request(app).post("/api/v1/admin/admins")).send({ email: `nobody-${run}@example.com` });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("USER_NOT_FOUND");
  });

  it("you cannot revoke yourself", async () => {
    const res = await as("a", request(app).delete(`/api/v1/admin/admins/${ids.a}`));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CANNOT_REVOKE_SELF");
    expect((await ping("a")).status).toBe(200);
  });

  it("a newly granted admin can manage admins too, and revoke takes effect immediately", async () => {
    const res = await as("b", request(app).delete(`/api/v1/admin/admins/${ids.a}`));
    expect(res.status).toBe(204); // b revokes a
    expect((await ping("a")).status).toBe(403);
    // restore a via b, then b is revoked by a
    expect((await as("b", request(app).post("/api/v1/admin/admins")).send({ email: emails.a })).status).toBe(201);
    expect((await as("a", request(app).delete(`/api/v1/admin/admins/${ids.b}`))).status).toBe(204);
    expect((await ping("b")).status).toBe(403);
  });

  it("revoking a non-admin is a 404", async () => {
    expect((await as("a", request(app).delete(`/api/v1/admin/admins/${ids.b}`))).status).toBe(404);
  });

  it("clients cannot call the admin database functions or write roles directly", async () => {
    expect((await clients.c!.rpc("list_admins")).error).not.toBeNull();
    expect((await clients.c!.rpc("find_user_id_by_email", { p_email: emails.a })).error).not.toBeNull();
    expect((await clients.c!.rpc("revoke_admin", { p_user_id: ids.a, p_actor_id: ids.c })).error).not.toBeNull();
    expect((await clients.c!.from("user_roles").insert({ user_id: ids.c, role: "admin" })).error).not.toBeNull();
    expect((await ping("c")).status).toBe(403);
  });
});
