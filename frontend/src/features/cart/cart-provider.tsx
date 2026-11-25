"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { api } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import type { Cart } from "@/types/api";

type Result = { error?: string };

interface CartContextValue {
  /** Null when signed out or not loaded yet. */
  cart: Cart | null;
  itemCount: number;
  quantityOf: (productId: string) => number;
  /** Sets (not adds) the quantity. 0 removes the line. Returns a friendly error message on failure. */
  setQuantity: (productId: string, quantity: number) => Promise<Result>;
  remove: (productId: string) => Promise<Result>;
  refresh: () => Promise<void>;
  /** Product ids with a request in flight (to disable their controls). */
  busy: ReadonlySet<string>;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const { user, getAccessToken } = useAuth();
  // The cart is tagged with its owner so a previous user's cart is never shown after switching accounts.
  const [state, setState] = useState<{ ownerId: string; cart: Cart } | null>(null);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const userId = user?.id ?? null;
  const cart = state && state.ownerId === userId ? state.cart : null;

  const refresh = useCallback(async () => {
    const token = await getAccessToken();
    if (!token || !userId) return;
    try {
      const res = await api<Cart>("/cart", { token });
      setState({ ownerId: userId, cart: res.data });
    } catch {
      /* keep whatever we had; the cart page shows its own error */
    }
  }, [getAccessToken, userId]);

  // Initial load per signed-in user; state is only set after the awaited request (and not after unmount).
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const res = await api<Cart>("/cart", { token });
        if (!cancelled) setState({ ownerId: userId, cart: res.data });
      } catch {
        /* cart page and controls surface their own errors */
      }
    })();
    return () => { cancelled = true; };
  }, [userId, getAccessToken]);

  const mutate = useCallback(
    async (productId: string, run: (token: string) => Promise<Cart>): Promise<Result> => {
      const token = await getAccessToken();
      if (!token || !userId) return { error: "Please log in to use your cart." };
      setBusy((b) => new Set(b).add(productId));
      try {
        setState({ ownerId: userId, cart: await run(token) });
        return {};
      } catch (err) {
        return { error: describeApiError(err) };
      } finally {
        setBusy((b) => { const n = new Set(b); n.delete(productId); return n; });
      }
    },
    [getAccessToken, userId],
  );

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      itemCount: cart?.item_count ?? 0,
      quantityOf: (id) => cart?.items.find((i) => i.product_id === id)?.quantity ?? 0,
      setQuantity: (id, quantity) =>
        quantity <= 0
          ? mutate(id, async (t) => (await api<Cart>(`/cart/items/${id}`, { method: "DELETE", token: t })).data)
          : mutate(id, async (t) => (await api<Cart>(`/cart/items/${id}`, { method: "PUT", body: { quantity }, token: t })).data),
      remove: (id) => mutate(id, async (t) => (await api<Cart>(`/cart/items/${id}`, { method: "DELETE", token: t })).data),
      refresh,
      busy,
    }),
    [cart, mutate, refresh, busy],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}

