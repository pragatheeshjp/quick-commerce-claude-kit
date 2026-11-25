import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { z, ZodError } from "zod";
import { AppError } from "../src/lib/errors.js";
import { createAuthMiddleware } from "../src/middleware/auth.js";
import { errorHandler, notFound } from "../src/middleware/error.js";
import { validate } from "../src/middleware/validate.js";

function appWith(setup: (app: express.Express) => void) {
  const app = express();
  app.use(express.json());
  setup(app);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

describe("requireAuth", () => {
  const verifyToken = vi.fn(async (t: string) => {
    if (t === "good") return { userId: "u1", email: "a@b.co" };
    throw new Error("secret internal reason: signature mismatch");
  });
  const { requireAuth } = createAuthMiddleware({ verifyToken, isAdmin: async () => false });
  const app = appWith((a) => a.get("/p", requireAuth, (req, res) => { res.json({ user: req.user }); }));

  it("accepts a valid bearer token and exposes only the verified identity", async () => {
    const res = await request(app).get("/p").set("Authorization", "Bearer good");
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ id: "u1", email: "a@b.co" });
    expect(verifyToken).toHaveBeenCalledWith("good");
  });

  it.each([["no header", undefined], ["wrong scheme", "Token good"], ["lowercase scheme", "bearer good"], ["empty token", "Bearer "], ["bare token", "good"]])(
    "rejects %s with 401 before verifying anything",
    async (_l, header) => {
      verifyToken.mockClear();
      const r = request(app).get("/p");
      const res = await (header === undefined ? r : r.set("Authorization", header));
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
      expect(verifyToken).not.toHaveBeenCalled();
    },
  );

  it("turns any verification failure into a generic 401 (no internal reason leaked)", async () => {
    const res = await request(app).get("/p").set("Authorization", "Bearer forged");
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Invalid or expired token");
    expect(JSON.stringify(res.body)).not.toContain("signature mismatch");
  });
});

describe("requireAdmin", () => {
  const build = (isAdmin: (id: string) => Promise<boolean>) => {
    const { requireAuth, requireAdmin } = createAuthMiddleware({ verifyToken: async () => ({ userId: "u1" }), isAdmin });
    return appWith((a) => {
      a.get("/admin", requireAuth, requireAdmin, (_req, res) => { res.json({ ok: true }); });
      a.get("/no-auth", requireAdmin, (_req, res) => { res.json({ ok: true }); }); // mis-mounted: requireAuth missing
    });
  };
  const get = (app: express.Express, path = "/admin") => request(app).get(path).set("Authorization", "Bearer t");

  it("lets admins through and forbids everyone else", async () => {
    expect((await get(build(async () => true))).status).toBe(200);
    const res = await get(build(async () => false));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("fails closed (401) if it is ever mounted without requireAuth", async () => {
    expect((await get(build(async () => true), "/no-auth")).status).toBe(401);
  });

  it("a failing role lookup is a generic 500, never an accidental grant", async () => {
    const res = await get(build(async () => { throw new Error("db down"); }));
    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({ code: "INTERNAL", message: "Internal server error" });
  });
});

describe("error handler", () => {
  const thrower = (err: unknown) => appWith((a) => a.get("/x", () => { throw err; }));

  it("renders AppError with its status, code and details", async () => {
    const res = await request(thrower(new AppError(409, "CONFLICT", "Nope", { field: "sku" }))).get("/x");
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ success: false, error: { code: "CONFLICT", message: "Nope", details: { field: "sku" } } });
  });

  it("renders ZodError as 400 VALIDATION_ERROR with the issues", async () => {
    const zerr = (() => { try { z.object({ a: z.string() }).parse({}); } catch (e) { return e as ZodError; } })()!;
    const res = await request(thrower(zerr)).get("/x");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details[0].path).toEqual(["a"]);
  });

  it("keeps 4xx statuses from body parsing (malformed JSON, too large)", async () => {
    const res = await request(appWith(() => undefined)).post("/x").set("Content-Type", "application/json").send("{oops");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
    const big = await request(thrower(Object.assign(new Error("too big"), { status: 413 }))).get("/x");
    expect(big.status).toBe(413);
  });

  it.each([
    ["an Error", new Error("SELECT * FROM secrets failed")],
    ["a 5xx-status error", Object.assign(new Error("upstream"), { status: 502 })],
    ["a thrown string", "plain string"],
  ])("hides internals for %s: generic 500", async (_l, err) => {
    const res = await request(thrower(err)).get("/x");
    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({ code: "INTERNAL", message: "Internal server error" });
    expect(JSON.stringify(res.body)).not.toMatch(/SELECT|upstream|plain string/);
  });

  it("returns a JSON 404 for unknown routes", async () => {
    const res = await request(appWith(() => undefined)).get("/nope");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

describe("validate middleware", () => {
  const app = appWith((a) =>
    a.post("/items/:id", validate({ params: z.object({ id: z.coerce.number().int() }), query: z.object({ n: z.coerce.number().default(1) }), body: z.object({ name: z.string().trim().min(1) }) }),
      (req, res) => { res.json({ body: req.body, params: res.locals.params, query: res.locals.query }); }),
  );

  it("replaces the body with parsed values and exposes parsed params/query on res.locals", async () => {
    const res = await request(app).post("/items/42?n=5").send({ name: "  milk  " });
    expect(res.body).toEqual({ body: { name: "milk" }, params: { id: 42 }, query: { n: 5 } });
  });

  it("strips nothing silently: invalid input becomes a 400 and the handler never runs", async () => {
    for (const [path, body] of [["/items/abc", { name: "x" }], ["/items/1", { name: "   " }], ["/items/1", {}]] as const) {
      const res = await request(app).post(path).send(body);
      expect(res.status, path).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
  });
});
