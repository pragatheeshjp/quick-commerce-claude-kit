import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const app = createApp({
  verifyToken: async (t) => {
    if (t === "customer-token") return { userId: "u-customer", email: "c@example.com" };
    if (t === "admin-token") return { userId: "u-admin" };
    throw new Error("bad token");
  },
  isAdmin: async (id) => id === "u-admin",
});

describe("GET /api/v1/health", () => {
  it("returns ok", async () => {
    const res = await request(app).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("ok");
  });

  it("returns a JSON 404 for unknown routes", async () => {
    const res = await request(app).get("/nope");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 400 JSON for malformed request bodies", async () => {
    const res = await request(app).post("/api/v1/health").set("Content-Type", "application/json").send("{bad");
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe("authentication", () => {
  it("rejects /me without a token", async () => {
    const res = await request(app).get("/api/v1/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects /me with a malformed Authorization header", async () => {
    const res = await request(app).get("/api/v1/me").set("Authorization", "Token abc");
    expect(res.status).toBe(401);
  });

  it("rejects /me with an invalid token", async () => {
    const res = await request(app).get("/api/v1/me").set("Authorization", "Bearer nope");
    expect(res.status).toBe(401);
  });
});

describe("authorization", () => {
  it("rejects admin routes without a token", async () => {
    const res = await request(app).get("/api/v1/admin/ping");
    expect(res.status).toBe(401);
  });

  it("forbids customers from admin routes", async () => {
    const res = await request(app).get("/api/v1/admin/ping").set("Authorization", "Bearer customer-token");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("allows admins", async () => {
    const res = await request(app).get("/api/v1/admin/ping").set("Authorization", "Bearer admin-token");
    expect(res.status).toBe(200);
  });

  it("ignores client-supplied role/user hints", async () => {
    const res = await request(app)
      .get("/api/v1/admin/ping?role=admin")
      .set("Authorization", "Bearer customer-token")
      .set("X-User-Role", "admin");
    expect(res.status).toBe(403);
  });
});
