import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeQuery } from "./helpers/supabase-fake.js";

vi.mock("../src/lib/supabase.js", () => ({ supabaseAdmin: { from: vi.fn(), rpc: vi.fn() } }));

import { createApp } from "../src/app.js";
import { isAdminUser } from "../src/lib/roles.js";
import { supabaseAdmin } from "../src/lib/supabase.js";

const from = vi.mocked(supabaseAdmin.from);

beforeEach(() => from.mockReset());

describe("isAdminUser", () => {
  it("is true only when an admin role row exists, queried for exactly that user and role", async () => {
    const q = fakeQuery({ data: { role: "admin" } });
    from.mockReturnValue(q);
    expect(await isAdminUser("u1")).toBe(true);
    expect(from).toHaveBeenCalledWith("user_roles");
    expect(q.calls).toContainEqual(["eq", ["user_id", "u1"]]);
    expect(q.calls).toContainEqual(["eq", ["role", "admin"]]);
  });

  it("is false when there is no row", async () => {
    from.mockReturnValue(fakeQuery({ data: null }));
    expect(await isAdminUser("u1")).toBe(false);
  });

  it("propagates database errors instead of silently denying or granting", async () => {
    from.mockReturnValue(fakeQuery({ error: { message: "boom" } }));
    await expect(isAdminUser("u1")).rejects.toMatchObject({ message: "boom" });
  });
});

describe("GET /api/v1/me", () => {
  const app = createApp({
    verifyToken: async (t) => {
      if (t === "customer" || t === "admin") return { userId: t, email: `${t}@example.com` };
      throw new Error("bad");
    },
    isAdmin: async (id) => id === "admin",
  });
  const get = (t: string) => request(app).get("/api/v1/me").set("Authorization", `Bearer ${t}`);

  it("returns the verified identity, role and profile", async () => {
    from.mockReturnValue(fakeQuery({ data: { full_name: "Asha K", phone: null } }));
    const res = await get("customer");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: "customer", email: "customer@example.com", role: "customer", profile: { full_name: "Asha K", phone: null } });
  });

  it("reports the admin role from the server-side lookup", async () => {
    from.mockReturnValue(fakeQuery({ data: null }));
    const res = await get("admin");
    expect(res.body.data.role).toBe("admin");
    expect(res.body.data.profile).toBeNull();
  });

  it("looks the profile up by the token's user id only", async () => {
    const q = fakeQuery({ data: null });
    from.mockReturnValue(q);
    await get("customer");
    expect(from).toHaveBeenCalledWith("profiles");
    expect(q.calls).toContainEqual(["eq", ["id", "customer"]]);
  });

  it("returns a generic 500 (no database details) when the profile lookup fails", async () => {
    from.mockReturnValue(fakeQuery({ error: { message: "relation public.profiles does not exist" } }));
    const res = await get("customer");
    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({ code: "INTERNAL", message: "Internal server error" });
    expect(JSON.stringify(res.body)).not.toContain("profiles does not exist");
  });
});
