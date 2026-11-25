import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { AppError } from "../src/lib/errors.js";
import type { CatalogRepository } from "../src/repositories/catalog.repository.js";
import type { ProductRow } from "../src/types/catalog.js";

const product: ProductRow = {
  id: "11111111-1111-4111-8111-111111111111", category_id: "22222222-2222-4222-8222-222222222222",
  sku: "SKU-1", name: "Milk", description: null, brand: "Farm", unit_label: "1 L",
  price_paise: 6800, mrp_paise: 7000, stock_quantity: 42, image_path: "milk.png", is_active: true,
};

function fakeRepo(): CatalogRepository & { calls: Record<string, ReturnType<typeof vi.fn>> } {
  const calls = {
    listCategories: vi.fn(async () => []),
    createCategory: vi.fn(async (i) => ({ id: "c", ...i })),
    updateCategory: vi.fn(async (id, p) => ({ id, ...p })),
    listProducts: vi.fn(async () => ({ items: [product], total: 1 })),
    getProduct: vi.fn(async (id: string) => (id === product.id ? product : null)),
    createProduct: vi.fn(async (i) => ({ ...product, ...i })),
    updateProduct: vi.fn(async (_id, p) => ({ ...product, ...p })),
    adjustStock: vi.fn(async () => { throw new AppError(409, "INSUFFICIENT_STOCK", "Insufficient stock"); }),
  };
  return { ...(calls as unknown as CatalogRepository), calls };
}

const repo = fakeRepo();
const app = createApp({
  verifyToken: async (t) => {
    if (t === "customer") return { userId: "u-c" };
    if (t === "admin") return { userId: "u-a" };
    throw new Error("bad");
  },
  isAdmin: async (id) => id === "u-a",
  catalog: repo,
});
const asAdmin = (r: request.Test) => r.set("Authorization", "Bearer admin");

describe("public catalog", () => {
  it("hides raw stock and inactive flags, exposes in_stock and image_url", async () => {
    const res = await request(app).get("/api/v1/products");
    expect(res.status).toBe(200);
    const p = res.body.data[0];
    expect(p.in_stock).toBe(true);
    expect(p).not.toHaveProperty("stock_quantity");
    expect(p).not.toHaveProperty("is_active");
    expect(p.image_url).toMatch(/\/product-images\/milk\.png$/);
    expect(res.body.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
  });

  it("always queries active-only for the public endpoint", async () => {
    await request(app).get("/api/v1/products?includeInactive=true");
    expect(repo.calls.listProducts).toHaveBeenLastCalledWith(expect.objectContaining({ includeInactive: false }));
  });

  it("bounds pagination", async () => {
    expect((await request(app).get("/api/v1/products?pageSize=500")).status).toBe(400);
    expect((await request(app).get("/api/v1/products?page=0")).status).toBe(400);
  });

  it("rejects search text that could manipulate the PostgREST filter", async () => {
    for (const q of ["a,id.eq.1", "x)or(y", "a%b", "100*"]) {
      expect((await request(app).get("/api/v1/products").query({ q })).status).toBe(400);
    }
    expect((await request(app).get("/api/v1/products").query({ q: "Amul Gold-500" })).status).toBe(200);
  });

  it("validates ids and returns 404 for unknown products", async () => {
    expect((await request(app).get("/api/v1/products/not-a-uuid")).status).toBe(400);
    expect((await request(app).get("/api/v1/products/33333333-3333-4333-8333-333333333333")).status).toBe(404);
    expect((await request(app).get(`/api/v1/products/${product.id}`)).status).toBe(200);
  });
});

describe("admin catalog authorization", () => {
  const routes: [string, string][] = [
    ["get", "/api/v1/admin/products"], ["post", "/api/v1/admin/products"],
    ["patch", `/api/v1/admin/products/${product.id}`], ["post", `/api/v1/admin/products/${product.id}/stock`],
    ["post", "/api/v1/admin/categories"], ["patch", `/api/v1/admin/categories/${product.id}`],
    ["get", "/api/v1/admin/categories"],
  ];
  it.each(routes)("%s %s: 401 anonymous, 403 customer", async (method, path) => {
    const r = request(app) as unknown as Record<string, (p: string) => request.Test>;
    expect((await r[method]!(path)).status).toBe(401);
    expect((await r[method]!(path).set("Authorization", "Bearer customer")).status).toBe(403);
  });
});

describe("admin catalog validation", () => {
  const valid = {
    category_id: product.category_id, sku: "NEW-1", name: "Butter", unit_label: "100 g",
    price_paise: 5500, mrp_paise: 6000,
  };
  it("creates a product and maps initial_stock", async () => {
    const res = await asAdmin(request(app).post("/api/v1/admin/products")).send({ ...valid, initial_stock: 10 });
    expect(res.status).toBe(201);
    expect(repo.calls.createProduct).toHaveBeenLastCalledWith(expect.objectContaining({ stock_quantity: 10 }), "u-a");
  });
  it("rejects floats, negatives, mrp below price and unknown fields", async () => {
    const bad = [
      { ...valid, price_paise: 55.5 }, { ...valid, price_paise: -1 },
      { ...valid, price_paise: 7000, mrp_paise: 6000 }, { ...valid, role: "admin" },
      { ...valid, id: "44444444-4444-4444-8444-444444444444" },
    ];
    for (const b of bad) expect((await asAdmin(request(app).post("/api/v1/admin/products")).send(b)).status).toBe(400);
  });
  it("does not allow stock_quantity or empty bodies in PATCH", async () => {
    const url = `/api/v1/admin/products/${product.id}`;
    expect((await asAdmin(request(app).patch(url)).send({ stock_quantity: 999 })).status).toBe(400);
    expect((await asAdmin(request(app).patch(url)).send({})).status).toBe(400);
    expect((await asAdmin(request(app).patch(url)).send({ price_paise: 100 })).status).toBe(200);
  });
  it("validates stock adjustments and surfaces insufficient stock as 409", async () => {
    const url = `/api/v1/admin/products/${product.id}/stock`;
    expect((await asAdmin(request(app).post(url)).send({ delta: 0, reason: "restock" })).status).toBe(400);
    expect((await asAdmin(request(app).post(url)).send({ delta: 1.5, reason: "restock" })).status).toBe(400);
    expect((await asAdmin(request(app).post(url)).send({ delta: 5, reason: "order" })).status).toBe(400);
    const res = await asAdmin(request(app).post(url)).send({ delta: -5, reason: "adjustment" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INSUFFICIENT_STOCK");
  });
});

