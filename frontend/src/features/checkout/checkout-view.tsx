"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { EmptyState } from "@/components/feedback";
import { AddressBook } from "@/features/addresses/address-book";
import { useAuthedApi } from "@/features/auth/use-api";
import { useCart } from "@/features/cart/cart-provider";
import { describeApiError, isCouponError } from "@/lib/errors";
import { formatPaise } from "@/lib/money";
import { couponSchema } from "@/lib/validation";
import type { Address, Order, Quote } from "@/types/api";

type QuoteState = { key: string; quote?: Quote; error?: string; couponError?: string };

const newKey = () => globalThis.crypto?.randomUUID?.() ?? `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function CheckoutView() {
  const router = useRouter();
  const call = useAuthedApi();
  const { cart, refresh } = useCart();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<string | null>(null);
  const [couponFormError, setCouponFormError] = useState<string | null>(null);
  const [quoteState, setQuoteState] = useState<QuoteState | null>(null);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  // One idempotency key per distinct attempt: a retry of the SAME attempt reuses it, so a flaky network
  // can never create two orders. Changing address, coupon or cart starts a new attempt.
  const attempt = useRef<{ sig: string; key: string } | null>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onLoaded = useCallback((list: Address[]) => {
    setSelectedId((cur) => (cur && list.some((a) => a.id === cur) ? cur : (list.find((a) => a.is_default) ?? list[0])?.id ?? null));
  }, []);

  const signature = cart ? cart.items.map((i) => `${i.product_id}:${i.quantity}`).join(",") : "";
  const quoteKey = selectedId && cart && cart.items.length > 0 ? `${selectedId}|${coupon ?? ""}|${signature}` : null;

  // The server prices everything: we only ever display what /checkout/quote returns.
  useEffect(() => {
    if (!quoteKey || !selectedId) return;
    let cancelled = false;
    const body = (withCoupon: boolean) => ({ address_id: selectedId, ...(withCoupon && coupon ? { coupon_code: coupon } : {}) });
    (async () => {
      try {
        const res = await call<Quote>("/checkout/quote", { method: "POST", body: body(true) });
        if (!cancelled) setQuoteState({ key: quoteKey, quote: res.data });
      } catch (err) {
        if (coupon && isCouponError(err)) {
          // A bad coupon must not blank the page: fall back to the quote without it.
          try {
            const res = await call<Quote>("/checkout/quote", { method: "POST", body: body(false) });
            if (!cancelled) setQuoteState({ key: quoteKey, quote: res.data, couponError: describeApiError(err) });
          } catch (err2) {
            if (!cancelled) setQuoteState({ key: quoteKey, error: describeApiError(err2) });
          }
        } else if (!cancelled) {
          setQuoteState({ key: quoteKey, error: describeApiError(err) });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [quoteKey, selectedId, coupon, call]);

  const current = quoteState && quoteState.key === quoteKey ? quoteState : null;
  const quoting = quoteKey !== null && current === null;
  const effectiveCoupon = coupon && !current?.couponError ? coupon : null;

  function applyCoupon(e: FormEvent) {
    e.preventDefault();
    const parsed = couponSchema.safeParse(couponInput);
    if (!parsed.success) return setCouponFormError(parsed.error.issues[0]?.message ?? "Invalid coupon");
    setCouponFormError(null);
    setCoupon(parsed.data.toUpperCase());
  }

  async function placeOrder() {
    if (!quoteKey || !selectedId || !current?.quote) return;
    setPlacing(true);
    setPlaceError(null);
    const sig = `${quoteKey}|${effectiveCoupon ?? ""}`;
    if (attempt.current?.sig !== sig) attempt.current = { sig, key: newKey() };
    try {
      const res = await call<Order>("/orders", {
        method: "POST",
        headers: { "Idempotency-Key": attempt.current.key },
        body: { address_id: selectedId, ...(effectiveCoupon ? { coupon_code: effectiveCoupon } : {}) },
      });
      attempt.current = null;
      await refresh();
      router.push(`/orders/${res.data.id}`);
    } catch (err) {
      setPlaceError(describeApiError(err));
      setPlacing(false);
    }
  }

  if (!cart) return <p role="status" className="py-8 text-zinc-500">Loading checkout…</p>;
  if (cart.items.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyState title="Your cart is empty" hint="Add items before checking out." />
        <Link href="/" className="inline-block rounded-xl bg-emerald-700 px-5 py-2.5 font-semibold text-white hover:bg-emerald-800">Start shopping</Link>
      </div>
    );
  }

  const q = current?.quote;
  const canPlace = !!q && !!selectedId && !placing && !current?.error;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-8">
        <section aria-labelledby="addr-h">
          <h2 id="addr-h" className="mb-3 text-lg font-bold">1. Delivery address</h2>
          <AddressBook selectedId={selectedId} onSelect={setSelectedId} onLoaded={onLoaded} />
        </section>

        <section aria-labelledby="coupon-h">
          <h2 id="coupon-h" className="mb-3 text-lg font-bold">2. Coupon</h2>
          {effectiveCoupon ? (
            <p className="flex items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-emerald-900">
              <span><strong>{effectiveCoupon}</strong> applied</span>
              <button type="button" className="text-sm underline" onClick={() => { setCoupon(null); setCouponInput(""); }}>Remove</button>
            </p>
          ) : (
            <form onSubmit={applyCoupon} noValidate className="flex gap-2">
              <div className="flex-1">
                <label htmlFor="coupon" className="sr-only">Coupon code</label>
                <input
                  id="coupon" value={couponInput} onChange={(e) => setCouponInput(e.target.value)} placeholder="Coupon code" maxLength={40}
                  aria-invalid={couponFormError || current?.couponError ? true : undefined} aria-describedby="coupon-msg"
                  className="w-full rounded-xl border border-zinc-300 px-3.5 py-2.5 uppercase focus:outline-2 focus:outline-emerald-600"
                />
              </div>
              <button type="submit" className="rounded-xl border border-emerald-600 px-4 font-semibold text-emerald-700 hover:bg-emerald-50">Apply</button>
            </form>
          )}
          <p id="coupon-msg" role="alert" className="mt-1 min-h-5 text-sm text-red-700">{couponFormError ?? current?.couponError}</p>
        </section>
      </div>

      <aside className="h-fit rounded-2xl border border-zinc-200 bg-white p-4" aria-labelledby="sum-h">
        <h2 id="sum-h" className="text-lg font-bold">Order summary</h2>
        {!selectedId && <p className="mt-3 text-sm text-zinc-600">Choose or add a delivery address to see your total.</p>}
        {quoting && <p role="status" className="mt-3 text-sm text-zinc-500">Calculating your total…</p>}
        {current?.error && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {current.error} <Link href="/cart" className="underline">Back to cart</Link>
          </p>
        )}
        {q && (
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-zinc-600">Items subtotal</dt><dd>{formatPaise(q.subtotal_paise)}</dd></div>
            {q.discount_paise > 0 && <div className="flex justify-between text-emerald-800"><dt>Coupon discount</dt><dd>-{formatPaise(q.discount_paise)}</dd></div>}
            <div className="flex justify-between"><dt className="text-zinc-600">Delivery fee</dt><dd>{q.delivery_fee_paise === 0 ? "Free" : formatPaise(q.delivery_fee_paise)}</dd></div>
            <div className="flex justify-between border-t border-zinc-200 pt-2 text-base font-bold"><dt>Total</dt><dd>{formatPaise(q.total_paise)}</dd></div>
          </dl>
        )}
        {placeError && <p role="alert" className="mt-3 text-sm text-red-700">{placeError}</p>}
        <button
          type="button" onClick={placeOrder} disabled={!canPlace}
          className="mt-4 w-full rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {placing ? "Placing order…" : q ? `Place order · ${formatPaise(q.total_paise)}` : "Place order"}
        </button>
        <p className="mt-2 text-xs text-zinc-500">Prices and stock are re-checked when you place the order.</p>
      </aside>
    </div>
  );
}
