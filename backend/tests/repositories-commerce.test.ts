import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeQuery } from "./helpers/supabase-fake.js";

vi.mock("../src/lib/supabase.js", () => ({ supabaseAdmin: { from: vi.fn(), rpc: vi.fn() } }));

import { supabaseAdmin } from "../src/lib/supabase.js";
import { supabaseAddressRepository as addresses } from "../src/repositories/address.repository.js";
import { supabaseCartRepository as cart } from "../src/repositories/cart.repository.js";
import { supabaseOrderRepository as orders } from "../src/repositories/order.repository.js";

const from = vi.mocked(supabaseAdmin.from);
const rpc = vi.mocked(supabaseAdmin.rpc);

beforeEach(() => {
  from.mockReset();
  rpc.mockReset();
});

const dbError = (code: string, message = "db message", details?: string) => ({ error: { code, message, details } });
const rpcResult = (v: unknown) => rpc.mockResolvedValue(v as never);

describe("address repository", () => {
  it("every read is scoped to the user and ordered default-first", async () => {
    const q = fakeQuery({ data: [{ id: "a1" }] });
    from.mockReturnValue(q);
    expect(await addresses.list("u1")).toEqual([{ id: "a1" }]);
    expect(q.calls).toContainEqual(["eq", ["user_id", "u1"]]);
    expect(q.calls.filter(([m]: [string]) => m === "order")[0]).toEqual(["order", ["is_default", { ascending: false }]]);
  });

  it("counts addresses, treating a missing count as 0", async () => {
    from.mockReturnValueOnce(fakeQuery({ count: 4 }));
    expect(await addresses.count("u1")).toBe(4);
    from.mockReturnValueOnce(fakeQuery({ count: null }));
    expect(await addresses.count("u1")).toBe(0);
  });

  it("create always inserts as non-default with the token's user id, then promotes atomically if asked", async () => {
    const ins = fakeQuery({ data: { id: "a1", is_default: false } });
    from.mockReturnValue(ins);
    rpcResult({ data: true, error: null });
    const created = await addresses.create("u1", { label: "Home", line1: "x", line2: null, landmark: null, city: "c", state: "s", pincode: "560001", is_default: true });
    expect(ins.call("insert")).toEqual([{ label: "Home", line1: "x", line2: null, landmark: null, city: "c", state: "s", pincode: "560001", user_id: "u1", is_default: false }]);
    expect(rpc).toHaveBeenCalledWith("set_default_address", { p_user_id: "u1", p_address_id: "a1" });
    expect(created.is_default).toBe(true);
  });

  it("create without the default flag never calls the default-swap function", async () => {
    from.mockReturnValue(fakeQuery({ data: { id: "a1", is_default: false } }));
    await addresses.create("u1", { label: "Home", line1: "x", line2: null, landmark: null, city: "c", state: "s", pincode: "560001" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("update scopes by id AND user, and 404s for someone else's address", async () => {
    const q = fakeQuery({ data: null });
    from.mockReturnValue(q);
    await expect(addresses.update("u1", "a1", { label: "Work" })).rejects.toMatchObject({ status: 404 });
    expect(q.calls).toContainEqual(["eq", ["id", "a1"]]);
    expect(q.calls).toContainEqual(["eq", ["user_id", "u1"]]);
  });

  it("a default-only update skips the table update and uses the atomic swap", async () => {
    rpcResult({ data: true, error: null });
    from.mockReturnValue(fakeQuery({ data: { id: "a1", is_default: true } }));
    const res = await addresses.update("u1", "a1", { is_default: true });
    expect(res).toMatchObject({ id: "a1", is_default: true });
    expect(from).toHaveBeenCalledTimes(1); // only the final read
  });

  it("404s when the default swap finds no such address for that user", async () => {
    rpcResult({ data: false, error: null });
    await expect(addresses.update("u1", "a1", { is_default: true })).rejects.toMatchObject({ status: 404 });
  });

  it("remove 404s when nothing was deleted", async () => {
    from.mockReturnValue(fakeQuery({ data: null }));
    await expect(addresses.remove("u1", "a1")).rejects.toMatchObject({ status: 404 });
    from.mockReturnValue(fakeQuery({ data: { id: "a1" } }));
    await expect(addresses.remove("u1", "a1")).resolves.toBeUndefined();
  });

  it("setDefault is true only when the function says so", async () => {
    rpcResult({ data: true, error: null });
    expect(await addresses.setDefault("u1", "a1")).toBe(true);
    rpcResult({ data: null, error: null });
    expect(await addresses.setDefault("u1", "a1")).toBe(false);
  });

  it("finds only active pincodes", async () => {
    const q = fakeQuery({ data: { pincode: "560001" } });
    from.mockReturnValue(q);
    expect(await addresses.findPincode("560001")).toEqual({ pincode: "560001" });
    expect(q.calls).toContainEqual(["eq", ["is_active", true]]);
    from.mockReturnValue(fakeQuery({ data: null }));
    expect(await addresses.findPincode("999999")).toBeNull();
  });

  it("maps conflict/constraint errors and rethrows others", async () => {
    from.mockReturnValue(fakeQuery(dbError("23505")));
    await expect(addresses.create("u1", { label: "H", line1: "x", line2: null, landmark: null, city: "c", state: "s", pincode: "560001" })).rejects.toMatchObject({ status: 409 });
    from.mockReturnValue(fakeQuery(dbError("23514")));
    await expect(addresses.list("u1")).rejects.toMatchObject({ status: 400 });
    const raw = { code: "XX000", message: "boom" };
    from.mockReturnValue(fakeQuery({ error: raw }));
    await expect(addresses.list("u1")).rejects.toBe(raw);
  });
});

describe("cart repository", () => {
  it("returns no lines (and does not query items) when the user has no cart", async () => {
    from.mockReturnValueOnce(fakeQuery({ data: null }));
    expect(await cart.getLines("u1")).toEqual([]);
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("reads lines for the user's own cart only", async () => {
    from.mockReturnValueOnce(fakeQuery({ data: { id: "cart-1" } }));
    const items = fakeQuery({ data: [{ product_id: "p1", quantity: 2 }] });
    from.mockReturnValueOnce(items);
    expect(await cart.getLines("u1")).toEqual([{ product_id: "p1", quantity: 2 }]);
    expect(items.calls).toContainEqual(["eq", ["cart_id", "cart-1"]]);
  });

  it("setQuantity upserts the cart then the line (replace, not add)", async () => {
    from.mockReturnValueOnce(fakeQuery({ data: { id: "cart-1" } }));
    const line = fakeQuery({});
    from.mockReturnValueOnce(line);
    await cart.setQuantity("u1", "p1", 3);
    expect(line.call("upsert")).toEqual([{ cart_id: "cart-1", product_id: "p1", quantity: 3 }, { onConflict: "cart_id,product_id" }]);
  });

  it("removeItem 404s when there is no cart or the item is not in it", async () => {
    from.mockReturnValueOnce(fakeQuery({ data: null }));
    await expect(cart.removeItem("u1", "p1")).rejects.toMatchObject({ status: 404 });
    from.mockReturnValueOnce(fakeQuery({ data: { id: "cart-1" } }));
    from.mockReturnValueOnce(fakeQuery({ data: null }));
    await expect(cart.removeItem("u1", "p1")).rejects.toMatchObject({ status: 404, message: "Item not in cart" });
  });

  it("clear is a no-op without a cart, otherwise deletes that cart's lines", async () => {
    from.mockReturnValueOnce(fakeQuery({ data: null }));
    await cart.clear("u1");
    expect(from).toHaveBeenCalledTimes(1);
    from.mockReset();
    from.mockReturnValueOnce(fakeQuery({ data: { id: "cart-1" } }));
    const del = fakeQuery({});
    from.mockReturnValueOnce(del);
    await cart.clear("u1");
    expect(del.calls).toContainEqual(["eq", ["cart_id", "cart-1"]]);
  });

  it("reads product stock info for the cart check", async () => {
    from.mockReturnValue(fakeQuery({ data: { id: "p1", stock_quantity: 5, is_active: true } }));
    expect(await cart.getProductForCart("p1")).toEqual({ id: "p1", stock_quantity: 5, is_active: true });
  });

  it("lets unexpected database errors propagate (generic 500 upstream)", async () => {
    const raw = { code: "XX000", message: "boom" };
    from.mockReturnValue(fakeQuery({ error: raw }));
    await expect(cart.getLines("u1")).rejects.toBe(raw);
  });
});

describe("order repository: checkout", () => {
  it("passes snake_case parameters to the atomic SQL function", async () => {
    const result = { order_id: "o1", replayed: false, subtotal_paise: 1, discount_paise: 0, delivery_fee_paise: 0, total_paise: 1 };
    rpcResult({ data: result, error: null });
    expect(await orders.checkout({ userId: "u1", addressId: "a1", idempotencyKey: "key-12345", couponCode: "SAVE", dryRun: false })).toEqual(result);
    expect(rpc).toHaveBeenCalledWith("checkout", { p_user_id: "u1", p_address_id: "a1", p_idempotency_key: "key-12345", p_coupon_code: "SAVE", p_dry_run: false });
  });

  it("sends null for an absent coupon and honours dry runs", async () => {
    rpcResult({ data: {}, error: null });
    await orders.checkout({ userId: "u1", addressId: "a1", idempotencyKey: "quote", dryRun: true });
    expect(rpc).toHaveBeenCalledWith("checkout", expect.objectContaining({ p_coupon_code: null, p_dry_run: true }));
  });

  // Stable error codes raised by checkout()/cancel_order() -> [HTTP status, API code]
  const sqlErrors: [string, number, string][] = [
    ["ADDRESS_NOT_FOUND", 404, "ADDRESS_NOT_FOUND"],
    ["ORDER_NOT_FOUND", 404, "NOT_FOUND"],
    ["PINCODE_NOT_SERVICEABLE", 422, "PINCODE_NOT_SERVICEABLE"],
    ["CART_EMPTY", 400, "CART_EMPTY"],
    ["PRODUCT_UNAVAILABLE", 409, "PRODUCT_UNAVAILABLE"],
    ["INSUFFICIENT_STOCK", 409, "INSUFFICIENT_STOCK"],
    ["BELOW_MINIMUM_ORDER", 422, "BELOW_MINIMUM_ORDER"],
    ["COUPON_INVALID", 422, "COUPON_INVALID"],
    ["COUPON_MIN_ORDER_NOT_MET", 422, "COUPON_MIN_ORDER_NOT_MET"],
    ["COUPON_EXHAUSTED", 422, "COUPON_EXHAUSTED"],
    ["COUPON_ALREADY_USED", 422, "COUPON_ALREADY_USED"],
    ["ORDER_TOO_LARGE", 422, "ORDER_TOO_LARGE"],
    ["INVALID_TRANSITION", 409, "INVALID_TRANSITION"],
  ];
  it.each(sqlErrors)("maps SQL error %s to %i %s", async (message, status, code) => {
    rpcResult({ data: null, ...dbError("P0001", message) });
    await expect(orders.checkout({ userId: "u", addressId: "a", idempotencyKey: "k-12345678", dryRun: false })).rejects.toMatchObject({ status, code });
  });

  it("forwards only the safe detail (product id / paise threshold) as `details.info`", async () => {
    rpcResult({ data: null, ...dbError("P0001", "BELOW_MINIMUM_ORDER", "9900") });
    const err = await orders.checkout({ userId: "u", addressId: "a", idempotencyKey: "k-12345678", dryRun: false }).catch((e) => e);
    expect(err.details).toEqual({ info: "9900" });
    rpcResult({ data: null, ...dbError("P0001", "CART_EMPTY") });
    expect((await orders.checkout({ userId: "u", addressId: "a", idempotencyKey: "k-12345678", dryRun: false }).catch((e) => e)).details).toBeUndefined();
  });

  it("rethrows unknown errors untouched", async () => {
    const raw = { code: "XX000", message: "deadlock detected" };
    rpcResult({ data: null, error: raw });
    await expect(orders.checkout({ userId: "u", addressId: "a", idempotencyKey: "k-12345678", dryRun: false })).rejects.toBe(raw);
  });
});

describe("order repository: reads and transitions", () => {
  it("lists a user's orders newest first with exact-count pagination", async () => {
    const q = fakeQuery({ data: [{ id: "o1" }], count: 31 });
    from.mockReturnValue(q);
    expect(await orders.listForUser("u1", 2, 10)).toEqual({ items: [{ id: "o1" }], total: 31 });
    expect(q.calls).toContainEqual(["eq", ["user_id", "u1"]]);
    expect(q.call("range")).toEqual([10, 19]);
    expect(q.calls[1]).toEqual(["eq", ["user_id", "u1"]]);
  });

  it("a user can only fetch their own order (id AND user_id), null otherwise", async () => {
    const q = fakeQuery({ data: null });
    from.mockReturnValue(q);
    expect(await orders.getForUser("u1", "o1")).toBeNull();
    expect(q.calls).toContainEqual(["eq", ["id", "o1"]]);
    expect(q.calls).toContainEqual(["eq", ["user_id", "u1"]]);
  });

  it("customer cancel passes the user; admin cancel passes null (no ownership scope)", async () => {
    rpcResult({ data: "cancelled", error: null });
    await orders.cancel("o1", "u1");
    expect(rpc).toHaveBeenLastCalledWith("cancel_order", { p_order_id: "o1", p_user_id: "u1" });
    await orders.cancel("o1", null);
    expect(rpc).toHaveBeenLastCalledWith("cancel_order", { p_order_id: "o1", p_user_id: null });
  });

  it("cancel maps ORDER_NOT_FOUND / INVALID_TRANSITION", async () => {
    rpcResult({ data: null, ...dbError("P0002", "ORDER_NOT_FOUND") });
    await expect(orders.cancel("o1", "u1")).rejects.toMatchObject({ status: 404 });
    rpcResult({ data: null, ...dbError("P0001", "INVALID_TRANSITION") });
    await expect(orders.cancel("o1", "u1")).rejects.toMatchObject({ status: 409 });
  });

  it("admin list filters by status only when given", async () => {
    const withStatus = fakeQuery({ data: [], count: 0 });
    from.mockReturnValueOnce(withStatus);
    await orders.listAll("pending", 1, 20);
    expect(withStatus.calls).toContainEqual(["eq", ["status", "pending"]]);
    const all = fakeQuery({ data: [], count: 0 });
    from.mockReturnValueOnce(all);
    await orders.listAll(undefined, 1, 20);
    expect(all.call("eq")).toBeUndefined();
  });

  it("transition is optimistic: it updates only if the order is still in the expected status", async () => {
    const hit = fakeQuery({ data: { id: "o1" } });
    from.mockReturnValueOnce(hit);
    expect(await orders.transition("o1", "pending", "confirmed")).toBe(true);
    expect(hit.call("update")).toEqual([{ status: "confirmed" }]);
    expect(hit.calls).toContainEqual(["eq", ["status", "pending"]]);
    from.mockReturnValueOnce(fakeQuery({ data: null }));
    expect(await orders.transition("o1", "pending", "confirmed")).toBe(false);
  });

  it("getAny returns the order or null", async () => {
    from.mockReturnValueOnce(fakeQuery({ data: { id: "o1" } }));
    expect(await orders.getAny("o1")).toEqual({ id: "o1" });
    from.mockReturnValueOnce(fakeQuery({ data: null }));
    expect(await orders.getAny("o2")).toBeNull();
  });
});
