"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/feedback";
import { formatPaise } from "@/lib/money";
import type { CartItem } from "@/types/api";
import { useCart } from "./cart-provider";

function Line({ item }: { item: CartItem }) {
  const { setQuantity, remove, busy } = useCart();
  const [error, setError] = useState<string | null>(null);
  const pending = busy.has(item.product_id);

  async function change(next: number) {
    setError(null);
    const { error: err } = await setQuantity(item.product_id, next);
    if (err) setError(err);
  }

  return (
    <li className="flex gap-4 py-4">
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-emerald-50">
        {item.image_url ? (
          <Image src={item.image_url} alt="" fill sizes="80px" className="object-cover" />
        ) : (
          <span aria-hidden="true" className="flex h-full items-center justify-center text-3xl font-bold text-emerald-300">
            {item.name.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <Link href={`/product/${item.product_id}`} className="line-clamp-2 font-medium hover:underline">{item.name}</Link>
        <p className="text-sm text-zinc-500">{item.unit_label} · {formatPaise(item.unit_price_paise)} each</p>
        {item.issue === "unavailable" && <p role="alert" className="mt-1 text-sm text-red-700">No longer available. Remove it to continue.</p>}
        {item.issue === "insufficient_stock" && (
          <p role="alert" className="mt-1 text-sm text-amber-800">
            Only {item.available_quantity ?? 0} left. Reduce the quantity to continue.
          </p>
        )}
        {error && <p role="alert" className="mt-1 text-sm text-red-700">{error}</p>}
        <div className="mt-2 flex items-center gap-3">
          <div role="group" aria-label={`${item.name} quantity`} className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white p-1">
            <button type="button" disabled={pending || item.quantity <= 1} onClick={() => change(item.quantity - 1)} aria-label={`Decrease quantity of ${item.name}`} className="h-8 w-8 rounded-lg text-lg font-bold hover:bg-zinc-100 disabled:opacity-40">
              <span aria-hidden="true">−</span>
            </button>
            <span aria-live="polite" className="min-w-6 text-center font-semibold">{item.quantity}</span>
            <button type="button" disabled={pending || item.quantity >= 50} onClick={() => change(item.quantity + 1)} aria-label={`Increase quantity of ${item.name}`} className="h-8 w-8 rounded-lg text-lg font-bold hover:bg-zinc-100 disabled:opacity-40">
              <span aria-hidden="true">+</span>
            </button>
          </div>
          <button type="button" disabled={pending} onClick={async () => { setError(null); const r = await remove(item.product_id); if (r.error) setError(r.error); }} className="text-sm text-zinc-600 underline hover:text-red-700">
            Remove{" "}<span className="sr-only">{item.name}</span>
          </button>
        </div>
      </div>
      <p className="shrink-0 font-semibold">{formatPaise(item.line_total_paise)}</p>
    </li>
  );
}

export function CartView() {
  const { cart, refresh } = useCart();

  // Always fetch fresh prices and stock when the cart page opens.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!cart) return <p role="status" className="py-8 text-zinc-500">Loading your cart…</p>;
  if (cart.items.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyState title="Your cart is empty" hint="Add a few things you need and they will show up here." />
        <Link href="/" className="inline-block rounded-xl bg-emerald-700 px-5 py-2.5 font-semibold text-white hover:bg-emerald-800">Start shopping</Link>
      </div>
    );
  }

  const blocked = cart.items.some((i) => !i.purchasable);
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white px-4">
        {cart.items.map((item) => <Line key={item.product_id} item={item} />)}
      </ul>
      <aside className="h-fit rounded-2xl border border-zinc-200 bg-white p-4">
        <h2 className="font-bold">Summary</h2>
        <p className="mt-3 flex justify-between"><span className="text-zinc-600">Items subtotal</span><span className="font-semibold">{formatPaise(cart.subtotal_paise)}</span></p>
        <p className="mt-1 text-xs text-zinc-500">Delivery fee and any coupon are applied at checkout. Final prices are confirmed when you place the order.</p>
        {blocked && <p role="alert" className="mt-3 text-sm text-amber-800">Fix the highlighted items to continue.</p>}
        {blocked || cart.subtotal_paise === 0 ? (
          <span aria-disabled="true" className="mt-4 block w-full cursor-not-allowed rounded-xl bg-zinc-300 px-4 py-2.5 text-center font-semibold text-zinc-600">Proceed to checkout</span>
        ) : (
          <Link href="/checkout" className="mt-4 block w-full rounded-xl bg-emerald-700 px-4 py-2.5 text-center font-semibold text-white hover:bg-emerald-800">Proceed to checkout</Link>
        )}
      </aside>
    </div>
  );
}

