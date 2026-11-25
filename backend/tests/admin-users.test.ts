import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { AppError } from "../src/lib/errors.js";
import type { AdminUsersRepository } from "../src/repositories/admin-users.repository.js";
import type { CatalogRepository } from "../src/repositories/catalog.repository.js";

const UID = "11111111-1111-4111-8111-111111111111";

function build(over: Partial<Record<keyof AdminUsersRepository, unknown>> = {}) {
  const adminUsers = {
    list: vi.fn(async () => [{ user_id: "a", email: "a@example.com", created_at: "2026-11-22T00:00:00Z" }]),
    findUserIdByEmail: vi.fn(async (e: string) => (e === "known@example.com" ? UID : null)),
    grant: vi.fn(async () => undefined),
    revoke: vi.fn(async () => true),
    ...over,
  };
  const catalog = {
    getProduct: vi.fn(async (id: string, includeInactive: boolean) =>
      id === UID ? { id, sku: "S", name: "N", stock_quantity: 4, is_active: !includeInactive ? true : false, image_path: null } : null),
  };
  const app = createApp({
    verifyToken: async (t) => { if (["customer", "admin"].includes(t)) return { userId: t }; throw new Error("bad"); },
    isAdmin: async (id) => id === "admin",
    adminUsers: adminUsers as unknown as AdminUsersRepository,
    catalog: catalog as unknown as CatalogRepository,
  });
  return { app, adminUsers, catalog };
}
const as = (t: string, r: request.Test) => r.set("Authorization", `Bearer ${t}`);

describe("admin management authorization", () => {
  const { app } = build();
  it.each([["get", "/api/v1/admin/admins"], ["post", "/api/v1/admin/admins"], ["delete", `/api/v1/admin/admins/${UID}`],
    ["get", `/api/v1/admin/products/${UID}`]] as const)("%s %s: 401 anonymous, 403 customer", async (m, p) => {
    expect((await request(app)[m](p)).status).toBe(401);
    expect((await as("customer", request(app)[m](p))).status).toBe(403);
  });
});

describe("granting admins", () => {
  it("grants by email (case-insensitive) and is idempotent through the repository", async () => {
    const { app, adminUsers } = build();
    const res = await as("admin", request(app).post("/api/v1/admin/admins")).send({ email: " Known@Example.com " });
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ user_id: UID, email: "known@example.com" });
    expect(adminUsers.grant).toHaveBeenCalledWith(UID);
  });
  it("404s for an unknown email and never grants", async () => {
    const { app, adminUsers } = build();
    const res = await as("admin", request(app).post("/api/v1/admin/admins")).send({ email: "nobody@example.com" });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("USER_NOT_FOUND");
    expect(adminUsers.grant).not.toHaveBeenCalled();
  });
  it("validates the body strictly", async () => {
    const { app } = build();
    for (const body of [{}, { email: "nope" }, { email: "a@b.co", role: "owner" }, { user_id: UID }]) {
      expect((await as("admin", request(app).post("/api/v1/admin/admins")).send(body)).status).toBe(400);
    }
  });
});

describe("revoking admins", () => {
  it("revokes, passing the acting admin so the database can block self-revoke", async () => {
    const { app, adminUsers } = build();
    expect((await as("admin", request(app).delete(`/api/v1/admin/admins/${UID}`))).status).toBe(204);
    expect(adminUsers.revoke).toHaveBeenCalledWith(UID, "admin");
  });
  it("404s when the target is not an admin", async () => {
    const { app } = build({ revoke: vi.fn(async () => false) });
    expect((await as("admin", request(app).delete(`/api/v1/admin/admins/${UID}`))).status).toBe(404);
  });
  it("surfaces self-revoke and last-admin as 409", async () => {
    for (const code of ["CANNOT_REVOKE_SELF", "LAST_ADMIN"]) {
      const { app } = build({ revoke: vi.fn(async () => { throw new AppError(409, code, "x"); }) });
      const res = await as("admin", request(app).delete(`/api/v1/admin/admins/${UID}`));
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe(code);
    }
  });
  it("rejects non-uuid ids", async () => {
    const { app } = build();
    expect((await as("admin", request(app).delete("/api/v1/admin/admins/not-a-uuid"))).status).toBe(400);
  });
});

describe("GET /admin/products/:id", () => {
  it("includes inactive products and stock for admins; 404 when missing", async () => {
    const { app, catalog } = build();
    const ok = await as("admin", request(app).get(`/api/v1/admin/products/${UID}`));
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ stock_quantity: 4, is_active: false });
    expect(catalog.getProduct).toHaveBeenCalledWith(UID, true);
    expect((await as("admin", request(app).get("/api/v1/admin/products/22222222-2222-4222-8222-222222222222"))).status).toBe(404);
  });
});
