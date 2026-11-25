import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { AppError } from "../src/lib/errors.js";
import type { OrderRepository } from "../src/repositories/order.repository.js";
import { ALLOWED_TRANSITIONS, canTransition } from "../src/services/order.service.js";
import { ORDER_STATUSES, type OrderRow, type OrderStatus } from "../src/types/orders.js";

const OID = "11111111-1111-4111-8111-111111111111";
const AID = "22222222-2222-4222-8222-222222222222";
const order = (o: Partial<OrderRow> = {}): OrderRow => ({
  id: OID, user_id: "u1", status: "pending", delivery_address: { city: "Bengaluru" },
  subtotal_paise: 18000, discount_paise: 0, delivery_fee_paise: 2500, total_paise: 20500,
  created_at: "2026-11-22T00:00:00Z",
  order_items: [{ product_id: "p", sku: "S", name: "Milk", quantity: 3, unit_price_paise: 6000 }], ...o,
});
const totals = { subtotal_paise: 18000, discount_paise: 0, delivery_fee_paise: 2500, total_paise: 20500 };

function build(over: Partial<Record<keyof OrderRepository, unknown>> = {}) {
  const repo = {
    checkout: vi.fn(async (i: { dryRun: boolean }) => ({ order_id: i.dryRun ? null : OID, replayed: false, ...totals })),
    listForUser: vi.fn(async () => ({ items: [order({ order_items: undefined })], total: 1 })),
    getForUser: vi.fn(async (_u: string, id: string) => (id === OID ? order() : null)),
    cancel: vi.fn(async () => undefined),
    listAll: vi.fn(async () => ({ items: [], total: 0 })),
    getAny: vi.fn(async (id: string) => (id === OID ? order() : null)),
    transition: vi.fn(async () => true),
    ...over,
  };
  const app = createApp({
    verifyToken: async (t) => { if (["u1", "u2", "admin"].includes(t)) return { userId: t }; throw new Error("bad"); },
    isAdmin: async (id) => id === "admin",
    orders: repo as unknown as OrderRepository,
  });
  return { app, repo };
}
const as = (t: string, r: request.Test) => r.set("Authorization", `Bearer ${t}`);
const KEY = "key-1234567890";

describe("status transition table", () => {
  const expected: Record<string, string[]> = {
    "pending>confirmed": [], "pending>cancelled": [], "confirmed>packed": [], "confirmed>cancelled": [],
    "packed>out_for_delivery": [], "out_for_delivery>delivered": [],
  };
  it("allows exactly the intended moves and nothing else", () => {
    for (const from of ORDER_STATUSES) for (const to of ORDER_STATUSES) {
      expect(canTransition(from, to), `${from} -> ${to}`).toBe(`${from}>${to}` in expected);
    }
  });
  it("terminal states have no exits", () => {
    expect(ALLOWED_TRANSITIONS.delivered).toEqual([]);
    expect(ALLOWED_TRANSITIONS.cancelled).toEqual([]);
  });
});

describe("authentication", () => {
  const { app } = build();
  it.each([["post", "/api/v1/checkout/quote"], ["post", "/api/v1/orders"], ["get", "/api/v1/orders"],
    ["get", `/api/v1/orders/${OID}`], ["post", `/api/v1/orders/${OID}/cancel`]] as const)("%s %s -> 401", async (m, p) => {
    expect((await request(app)[m](p)).status).toBe(401);
  });
});

describe("placing orders", () => {
  it("requires a well-formed Idempotency-Key", async () => {
    const { app, repo } = build();
    const body = { address_id: AID };
    expect((await as("u1", request(app).post("/api/v1/orders")).send(body)).status).toBe(400);
    expect((await as("u1", request(app).post("/api/v1/orders")).set("Idempotency-Key", "short").send(body)).status).toBe(400);
    expect((await as("u1", request(app).post("/api/v1/orders")).set("Idempotency-Key", "has spaces in it!").send(body)).status).toBe(400);
    expect(repo.checkout).not.toHaveBeenCalled();
  });

  it("201 on a new order, 200 on an idempotent replay, using the token's user", async () => {
    const created = build();
    const res = await as("u1", request(created.app).post("/api/v1/orders")).set("Idempotency-Key", KEY).send({ address_id: AID, coupon_code: "WELCOME50" });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ id: OID, total_paise: 20500, status: "pending" });
    expect(res.body.data.items[0].line_total_paise).toBe(18000);
    expect(created.repo.checkout).toHaveBeenCalledWith({
      userId: "u1", addressId: AID, idempotencyKey: KEY, couponCode: "WELCOME50", dryRun: false,
    });

    const replay = build({ checkout: vi.fn(async () => ({ order_id: OID, replayed: true, ...totals })) });
    const r2 = await as("u1", request(replay.app).post("/api/v1/orders")).set("Idempotency-Key", KEY).send({ address_id: AID });
    expect(r2.status).toBe(200);
    expect(r2.body.meta.replayed).toBe(true);
  });

  it("rejects client-supplied prices, totals, user ids, items or bad coupons", async () => {
    const { app, repo } = build();
    for (const extra of [{ total_paise: 1 }, { user_id: "u2" }, { items: [] }, { discount_paise: 99999 }, { coupon_code: "bad code!" }]) {
      const res = await as("u1", request(app).post("/api/v1/orders")).set("Idempotency-Key", KEY).send({ address_id: AID, ...extra });
      expect(res.status, JSON.stringify(extra)).toBe(400);
    }
    expect(repo.checkout).not.toHaveBeenCalled();
  });

  it("quote is a dry run that writes nothing", async () => {
    const { app, repo } = build();
    const res = await as("u1", request(app).post("/api/v1/checkout/quote")).send({ address_id: AID });
    expect(res.body.data).toEqual(totals);
    expect(repo.checkout).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }));
  });

  it("surfaces SQL business errors with their status and code", async () => {
    const { app } = build({ checkout: vi.fn(async () => { throw new AppError(409, "INSUFFICIENT_STOCK", "x"); }) });
    const res = await as("u1", request(app).post("/api/v1/orders")).set("Idempotency-Key", KEY).send({ address_id: AID });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INSUFFICIENT_STOCK");
  });
});

describe("viewing and cancelling", () => {
  it("scopes reads and cancel to the token's user; unknown/foreign orders are 404", async () => {
    const { app, repo } = build();
    expect((await as("u2", request(app).get(`/api/v1/orders/${OID}`))).status).toBe(200); // fake repo ignores user; scoping asserted below
    expect(repo.getForUser).toHaveBeenCalledWith("u2", OID);
    expect((await as("u1", request(app).get("/api/v1/orders/33333333-3333-4333-8333-333333333333"))).status).toBe(404);
    await as("u2", request(app).post(`/api/v1/orders/${OID}/cancel`));
    expect(repo.cancel).toHaveBeenCalledWith(OID, "u2");
  });
  it("bounds pagination", async () => {
    const { app } = build();
    expect((await as("u1", request(app).get("/api/v1/orders?pageSize=999"))).status).toBe(400);
  });
});

describe("admin orders", () => {
  it("401 anonymous, 403 customer", async () => {
    const { app } = build();
    for (const [m, p] of [["get", "/api/v1/admin/orders"], ["get", `/api/v1/admin/orders/${OID}`], ["patch", `/api/v1/admin/orders/${OID}/status`]] as const) {
      expect((await request(app)[m](p)).status).toBe(401);
      expect((await as("u1", request(app)[m](p))).status).toBe(403);
    }
  });

  const change = (app: ReturnType<typeof build>["app"], status: string) =>
    as("admin", request(app).patch(`/api/v1/admin/orders/${OID}/status`)).send({ status });

  it("applies legal transitions with an optimistic status check", async () => {
    const { app, repo } = build();
    expect((await change(app, "confirmed")).status).toBe(200);
    expect(repo.transition).toHaveBeenCalledWith(OID, "pending", "confirmed");
  });
  it("rejects skipping steps and unknown or pending targets", async () => {
    const { app, repo } = build();
    for (const s of ["packed", "delivered", "out_for_delivery"]) expect((await change(app, s)).status, s).toBe(409);
    for (const s of ["pending", "bogus"]) expect((await change(app, s)).status, s).toBe(400);
    expect(repo.transition).not.toHaveBeenCalled();
  });
  it("rejects moves out of terminal states, but cancelling twice is idempotent", async () => {
    const delivered = build({ getAny: vi.fn(async () => order({ status: "delivered" })) });
    expect((await change(delivered.app, "cancelled")).status).toBe(409);
    expect(delivered.repo.cancel).not.toHaveBeenCalled();
    const cancelled = build({ getAny: vi.fn(async () => order({ status: "cancelled" as OrderStatus })) });
    expect((await change(cancelled.app, "cancelled")).status).toBe(200);
    expect((await change(cancelled.app, "confirmed")).status).toBe(409);
  });
  it("409 when the status changed concurrently", async () => {
    const { app } = build({ transition: vi.fn(async () => false) });
    expect((await change(app, "confirmed")).status).toBe(409);
  });
  it("admin cancel goes through cancel_order (stock restore), with no user scope", async () => {
    const { app, repo } = build();
    expect((await change(app, "cancelled")).status).toBe(200);
    expect(repo.cancel).toHaveBeenCalledWith(OID, null);
  });
});
