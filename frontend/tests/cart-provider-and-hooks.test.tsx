import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import type { Cart } from "@/types/api";

const getAccessToken = vi.fn();
const authState: { user: { id: string } | null } = { user: { id: "u1" } };
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ user: authState.user, getAccessToken }),
}));
const api = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: (...a: unknown[]) => api(...a) }));

import { CartProvider, useCart } from "@/features/cart/cart-provider";
import { useApiData, useAuthedApi } from "@/features/auth/use-api";

const cartOf = (qty: number): Cart => ({
  items: qty ? [{ product_id: "p1", name: "Milk", unit_label: "1 L", image_url: null, quantity: qty, unit_price_paise: 6800, mrp_paise: 7000, line_total_paise: 6800 * qty, purchasable: true, issue: null }] : [],
  item_count: qty,
  subtotal_paise: 6800 * qty,
});
const wrapper = ({ children }: { children: ReactNode }) => <CartProvider>{children}</CartProvider>;

beforeEach(() => {
  api.mockReset();
  getAccessToken.mockReset().mockResolvedValue("tok");
  authState.user = { id: "u1" };
});

describe("CartProvider", () => {
  it("does nothing while signed out", async () => {
    authState.user = null;
    const { result } = renderHook(() => useCart(), { wrapper });
    expect(result.current.cart).toBeNull();
    expect(result.current.itemCount).toBe(0);
    expect(result.current.quantityOf("p1")).toBe(0);
    await Promise.resolve();
    expect(api).not.toHaveBeenCalled();
  });

  it("loads the signed-in user's cart with their token", async () => {
    api.mockResolvedValue({ data: cartOf(2) });
    const { result } = renderHook(() => useCart(), { wrapper });
    await waitFor(() => expect(result.current.itemCount).toBe(2));
    expect(api).toHaveBeenCalledWith("/cart", { token: "tok" });
    expect(result.current.quantityOf("p1")).toBe(2);
    expect(result.current.quantityOf("other")).toBe(0);
  });

  it("setQuantity PUTs the exact quantity and adopts the server's repriced cart", async () => {
    api.mockResolvedValueOnce({ data: cartOf(1) });
    const { result } = renderHook(() => useCart(), { wrapper });
    await waitFor(() => expect(result.current.itemCount).toBe(1));
    api.mockResolvedValueOnce({ data: cartOf(3) });
    let outcome: { error?: string } = {};
    await act(async () => { outcome = await result.current.setQuantity("p1", 3); });
    expect(outcome).toEqual({});
    expect(api).toHaveBeenLastCalledWith("/cart/items/p1", { method: "PUT", body: { quantity: 3 }, token: "tok" });
    expect(result.current.cart?.subtotal_paise).toBe(20400);
  });

  it("a quantity of 0 (or less) removes the line with DELETE", async () => {
    api.mockResolvedValueOnce({ data: cartOf(1) });
    const { result } = renderHook(() => useCart(), { wrapper });
    await waitFor(() => expect(result.current.itemCount).toBe(1));
    api.mockResolvedValue({ data: cartOf(0) });
    await act(async () => { await result.current.setQuantity("p1", 0); });
    expect(api).toHaveBeenLastCalledWith("/cart/items/p1", { method: "DELETE", token: "tok" });
    await act(async () => { await result.current.setQuantity("p1", -2); });
    expect(api).toHaveBeenLastCalledWith("/cart/items/p1", { method: "DELETE", token: "tok" });
    await act(async () => { await result.current.remove("p1"); });
    expect(result.current.itemCount).toBe(0);
  });

  it("returns a friendly message and keeps the old cart when the API refuses", async () => {
    api.mockResolvedValueOnce({ data: cartOf(2) });
    const { result } = renderHook(() => useCart(), { wrapper });
    await waitFor(() => expect(result.current.itemCount).toBe(2));
    api.mockRejectedValueOnce(new ApiError(409, "INSUFFICIENT_STOCK", "x", { available_quantity: 2 }));
    let outcome: { error?: string } = {};
    await act(async () => { outcome = await result.current.setQuantity("p1", 9); });
    expect(outcome.error).toBe("Only 2 left in stock.");
    expect(result.current.itemCount).toBe(2);
  });

  it("marks a product busy while its request is in flight, then clears it", async () => {
    api.mockResolvedValueOnce({ data: cartOf(0) });
    const { result } = renderHook(() => useCart(), { wrapper });
    await waitFor(() => expect(result.current.cart).not.toBeNull());
    let release!: (v: unknown) => void;
    api.mockReturnValueOnce(new Promise((r) => { release = r; }));
    let pending!: Promise<unknown>;
    act(() => { pending = result.current.setQuantity("p1", 1); });
    await waitFor(() => expect(result.current.busy.has("p1")).toBe(true));
    await act(async () => { release({ data: cartOf(1) }); await pending; });
    expect(result.current.busy.has("p1")).toBe(false);
  });

  it("asks the user to log in if the session has no token", async () => {
    api.mockResolvedValue({ data: cartOf(0) });
    const { result } = renderHook(() => useCart(), { wrapper });
    await waitFor(() => expect(result.current.cart).not.toBeNull());
    getAccessToken.mockResolvedValue(null);
    let outcome: { error?: string } = {};
    await act(async () => { outcome = await result.current.setQuantity("p1", 1); });
    expect(outcome.error).toMatch(/log in/i);
  });

  it("never shows another user's cart after the account changes", async () => {
    api.mockResolvedValueOnce({ data: cartOf(4) });
    const { result, rerender } = renderHook(() => useCart(), { wrapper });
    await waitFor(() => expect(result.current.itemCount).toBe(4));
    authState.user = { id: "u2" };
    api.mockReturnValueOnce(new Promise(() => undefined)); // u2's cart is still loading
    rerender();
    expect(result.current.cart).toBeNull();
    expect(result.current.itemCount).toBe(0);
  });

  it("refresh re-fetches the cart", async () => {
    api.mockResolvedValueOnce({ data: cartOf(1) });
    const { result } = renderHook(() => useCart(), { wrapper });
    await waitFor(() => expect(result.current.itemCount).toBe(1));
    api.mockResolvedValueOnce({ data: cartOf(5) });
    await act(async () => { await result.current.refresh(); });
    expect(result.current.itemCount).toBe(5);
  });

  it("useCart outside a provider is a programming error", () => {
    expect(() => renderHook(() => useCart())).toThrow(/inside <CartProvider>/);
  });
});

describe("useApiData", () => {
  it("does not request anything for a null path", async () => {
    const { result } = renderHook(() => useApiData<string>(null));
    await Promise.resolve();
    expect(api).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ loading: false, data: undefined });
  });

  it("loads data and pagination meta with the user's token", async () => {
    api.mockResolvedValue({ data: ["a"], meta: { page: 1, pageSize: 20, total: 1 } });
    const { result } = renderHook(() => useApiData<string[]>("/orders"));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual(["a"]);
    expect(result.current.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    expect(api).toHaveBeenCalledWith("/orders", { token: "tok" });
  });

  it("reports a friendly error message instead of raw server text", async () => {
    api.mockRejectedValue(new ApiError(500, "INTERNAL", "stack trace here"));
    const { result } = renderHook(() => useApiData("/orders"));
    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.error).not.toContain("stack trace");
    expect(result.current.data).toBeUndefined();
  });

  it("is loading again when the path changes, and ignores a stale slow response", async () => {
    let releaseOld!: (v: unknown) => void;
    api.mockReturnValueOnce(new Promise((r) => { releaseOld = r; }));
    const { result, rerender } = renderHook(({ p }) => useApiData<string>(p), { initialProps: { p: "/a" } });
    api.mockResolvedValueOnce({ data: "B" });
    rerender({ p: "/b" });
    await waitFor(() => expect(result.current.data).toBe("B"));
    await act(async () => { releaseOld({ data: "A" }); await Promise.resolve(); });
    expect(result.current.data).toBe("B"); // the old request must not overwrite the new one
  });

  it("reload fetches again", async () => {
    api.mockResolvedValueOnce({ data: 1 });
    const { result } = renderHook(() => useApiData<number>("/n"));
    await waitFor(() => expect(result.current.data).toBe(1));
    api.mockResolvedValueOnce({ data: 2 });
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.data).toBe(2));
  });
});

describe("useAuthedApi", () => {
  it("attaches the current token to every call and keeps caller options", async () => {
    api.mockResolvedValue({ data: {} });
    const { result } = renderHook(() => useAuthedApi());
    await result.current("/addresses", { method: "POST", body: { a: 1 } });
    expect(api).toHaveBeenCalledWith("/addresses", { method: "POST", body: { a: 1 }, token: "tok" });
  });

  it("sends token null when signed out (the API will answer 401)", async () => {
    getAccessToken.mockResolvedValue(null);
    api.mockResolvedValue({ data: {} });
    const { result } = renderHook(() => useAuthedApi());
    await result.current("/me");
    expect(api).toHaveBeenCalledWith("/me", { token: null });
  });
});
