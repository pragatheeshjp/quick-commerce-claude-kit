import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeQuery } from "./helpers/supabase-fake.js";

vi.mock("../src/lib/supabase.js", () => ({ supabaseAdmin: { from: vi.fn(), rpc: vi.fn() } }));

import { supabaseAdmin } from "../src/lib/supabase.js";
import { supabaseAdminUsersRepository as adminUsers } from "../src/repositories/admin-users.repository.js";
import { supabaseCatalogRepository as catalog } from "../src/repositories/catalog.repository.js";

const from = vi.mocked(supabaseAdmin.from);
const rpc = vi.mocked(supabaseAdmin.rpc);

beforeEach(() => {
  from.mockReset();
  rpc.mockReset();
});

const dbError = (code: string, message = "db message") => ({ error: { code, message } });

describe("catalog repository: database error mapping", () => {
  const cases: [string, string, number, string][] = [
    ["23505", "duplicate key", 409, "CONFLICT"],
    ["23503", "fk violation", 400, "BAD_REQUEST"],
    ["23514", "check violation", 400, "BAD_REQUEST"],
    ["P0001", "SOMETHING_ELSE", 400, "BAD_REQUEST"],
    ["P0001", "INSUFFICIENT_STOCK", 409, "INSUFFICIENT_STOCK"],
    ["P0002", "PRODUCT_NOT_FOUND", 404, "NOT_FOUND"],
  ];
  it.each(cases)("code %s / %s -> %i %s", async (code, message, status, apiCode) => {
    from.mockReturnValue(fakeQuery(dbError(code, message)));
    await expect(catalog.createCategory({ slug: "x", name: "X" })).rejects.toMatchObject({ status, code: apiCode });
  });

  it("never leaks the raw database message in mapped errors", async () => {
    from.mockReturnValue(fakeQuery(dbError("23505", 'duplicate key value violates unique constraint "products_sku_key"')));
    const err = await catalog.createCategory({ slug: "x", name: "X" }).catch((e) => e);
    expect(err.message).not.toContain("products_sku_key");
  });

  it("rethrows unknown database errors unchanged (they become a generic 500 upstream)", async () => {
    const raw = { code: "XX000", message: "internal" };
    from.mockReturnValue(fakeQuery({ error: raw }));
    await expect(catalog.listCategories(true)).rejects.toBe(raw);
  });
});

describe("catalog repository: categories", () => {
  it("lists active categories only for the public view, all for admins, ordered", async () => {
    const pub = fakeQuery({ data: [{ id: "c1" }] });
    from.mockReturnValueOnce(pub);
    expect(await catalog.listCategories(false)).toEqual([{ id: "c1" }]);
    expect(pub.calls).toContainEqual(["eq", ["is_active", true]]);
    expect(pub.calls.filter(([m]: [string]) => m === "order")).toHaveLength(2);

    const adm = fakeQuery({ data: [] });
    from.mockReturnValueOnce(adm);
    await catalog.listCategories(true);
    expect(adm.call("eq")).toBeUndefined();
  });

  it("update scopes by id and 404s when nothing matched", async () => {
    const q = fakeQuery({ data: null });
    from.mockReturnValue(q);
    await expect(catalog.updateCategory("c1", { name: "N" })).rejects.toMatchObject({ status: 404, message: "Category not found" });
    expect(q.calls).toContainEqual(["eq", ["id", "c1"]]);
  });
});

describe("catalog repository: products", () => {
  const filter = { page: 1, pageSize: 20, includeInactive: false };

  it("filters by category slug including direct children, and paginates", async () => {
    const cats = fakeQuery({ data: [{ id: "root", slug: "dairy", parent_id: null }, { id: "kid", slug: "milk", parent_id: "root" }, { id: "other", slug: "snacks", parent_id: null }] });
    const prods = fakeQuery({ data: [{ id: "p1" }], count: 41 });
    from.mockReturnValueOnce(cats).mockReturnValueOnce(prods);
    const res = await catalog.listProducts({ ...filter, categorySlug: "dairy", page: 3, pageSize: 20 });
    expect(res).toEqual({ items: [{ id: "p1" }], total: 41 });
    expect(prods.call("in")).toEqual(["category_id", ["root", "kid"]]);
    expect(prods.call("range")).toEqual([40, 59]);
    expect(prods.calls).toContainEqual(["eq", ["is_active", true]]);
  });

  it("returns an empty page without querying products for an unknown category", async () => {
    from.mockReturnValueOnce(fakeQuery({ data: [{ id: "root", slug: "dairy", parent_id: null }] }));
    expect(await catalog.listProducts({ ...filter, categorySlug: "nope" })).toEqual({ items: [], total: 0 });
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("builds the name/brand search filter and includes inactive products for admins", async () => {
    const prods = fakeQuery({ data: [], count: 0 });
    from.mockReturnValue(prods);
    await catalog.listProducts({ ...filter, q: "amul", includeInactive: true });
    expect(prods.call("or")).toEqual(["name.ilike.%amul%,brand.ilike.%amul%"]);
    expect(prods.call("eq")).toBeUndefined();
  });

  it("treats a missing count as zero", async () => {
    from.mockReturnValue(fakeQuery({ data: [], count: null }));
    expect((await catalog.listProducts(filter)).total).toBe(0);
  });

  it("getProduct hides inactive products unless asked", async () => {
    const hidden = fakeQuery({ data: null });
    from.mockReturnValueOnce(hidden);
    expect(await catalog.getProduct("p1", false)).toBeNull();
    expect(hidden.calls).toContainEqual(["eq", ["is_active", true]]);
    const shown = fakeQuery({ data: { id: "p1" } });
    from.mockReturnValueOnce(shown);
    expect(await catalog.getProduct("p1", true)).toEqual({ id: "p1" });
    expect(shown.calls).not.toContainEqual(["eq", ["is_active", true]]);
  });

  it("creates with zero stock, then records opening stock through the atomic ledgered function", async () => {
    const ins = fakeQuery({ data: { id: "p1", stock_quantity: 0 } });
    from.mockReturnValue(ins);
    rpc.mockResolvedValue({ data: 25, error: null } as never);
    const p = await catalog.createProduct({ sku: "S", name: "N", stock_quantity: 25 }, "admin-1");
    expect(ins.call("insert")).toEqual([{ sku: "S", name: "N", stock_quantity: 0 }]);
    expect(rpc).toHaveBeenCalledWith("adjust_stock", { p_product_id: "p1", p_delta: 25, p_reason: "restock", p_actor: "admin-1" });
    expect(p.stock_quantity).toBe(25);
  });

  it("does not touch the stock ledger when there is no opening stock", async () => {
    from.mockReturnValue(fakeQuery({ data: { id: "p1", stock_quantity: 0 } }));
    await catalog.createProduct({ sku: "S", name: "N", stock_quantity: 0 }, "admin-1");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps duplicate SKUs on create to 409", async () => {
    from.mockReturnValue(fakeQuery(dbError("23505")));
    await expect(catalog.createProduct({ sku: "S" }, "a")).rejects.toMatchObject({ status: 409 });
  });

  it("update 404s for unknown products", async () => {
    from.mockReturnValue(fakeQuery({ data: null }));
    await expect(catalog.updateProduct("p1", { name: "N" })).rejects.toMatchObject({ status: 404, message: "Product not found" });
  });

  it("adjustStock passes the signed delta and actor and returns the new quantity", async () => {
    rpc.mockResolvedValue({ data: 7, error: null } as never);
    expect(await catalog.adjustStock("p1", -3, "adjustment", "admin-1")).toBe(7);
    expect(rpc).toHaveBeenCalledWith("adjust_stock", { p_product_id: "p1", p_delta: -3, p_reason: "adjustment", p_actor: "admin-1" });
  });

  it("adjustStock surfaces insufficient stock and unknown products distinctly", async () => {
    rpc.mockResolvedValue({ data: null, ...dbError("P0001", "INSUFFICIENT_STOCK") } as never);
    await expect(catalog.adjustStock("p1", -99, "adjustment", "a")).rejects.toMatchObject({ status: 409, code: "INSUFFICIENT_STOCK" });
    rpc.mockResolvedValue({ data: null, ...dbError("P0002", "PRODUCT_NOT_FOUND") } as never);
    await expect(catalog.adjustStock("nope", 1, "restock", "a")).rejects.toMatchObject({ status: 404 });
  });
});

describe("admin-users repository", () => {
  it("lists admins through the security-definer function", async () => {
    rpc.mockResolvedValue({ data: [{ user_id: "u", email: "a@b.co" }], error: null } as never);
    expect(await adminUsers.list()).toEqual([{ user_id: "u", email: "a@b.co" }]);
    expect(rpc).toHaveBeenCalledWith("list_admins");
  });

  it("finds a user id by email, or null", async () => {
    rpc.mockResolvedValueOnce({ data: "uid-1", error: null } as never);
    expect(await adminUsers.findUserIdByEmail("a@b.co")).toBe("uid-1");
    expect(rpc).toHaveBeenCalledWith("find_user_id_by_email", { p_email: "a@b.co" });
    rpc.mockResolvedValueOnce({ data: null, error: null } as never);
    expect(await adminUsers.findUserIdByEmail("x@y.co")).toBeNull();
  });

  it("grants idempotently (upsert ignoring duplicates)", async () => {
    const q = fakeQuery({});
    from.mockReturnValue(q);
    await adminUsers.grant("uid-1");
    expect(from).toHaveBeenCalledWith("user_roles");
    expect(q.call("upsert")).toEqual([{ user_id: "uid-1", role: "admin" }, { onConflict: "user_id,role", ignoreDuplicates: true }]);
  });

  it("revoke reports whether anything was removed", async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null } as never);
    expect(await adminUsers.revoke("u1", "actor")).toBe(true);
    expect(rpc).toHaveBeenCalledWith("revoke_admin", { p_user_id: "u1", p_actor_id: "actor" });
    rpc.mockResolvedValueOnce({ data: false, error: null } as never);
    expect(await adminUsers.revoke("u1", "actor")).toBe(false);
  });

  it("maps the self-revoke and last-admin guards to 409 with stable codes", async () => {
    rpc.mockResolvedValueOnce({ data: null, ...dbError("P0001", "CANNOT_REVOKE_SELF") } as never);
    await expect(adminUsers.revoke("a", "a")).rejects.toMatchObject({ status: 409, code: "CANNOT_REVOKE_SELF" });
    rpc.mockResolvedValueOnce({ data: null, ...dbError("P0001", "LAST_ADMIN") } as never);
    await expect(adminUsers.revoke("a", "b")).rejects.toMatchObject({ status: 409, code: "LAST_ADMIN" });
  });

  it("rethrows unexpected errors untouched", async () => {
    const raw = { code: "XX000", message: "internal" };
    rpc.mockResolvedValue({ data: null, error: raw } as never);
    await expect(adminUsers.list()).rejects.toBe(raw);
  });
});
