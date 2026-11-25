"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { useCart } from "./cart-provider";

const MAX_QTY = 50;

interface Props {
  productId: string;
  productName: string;
  inStock: boolean;
  /** "card" sits above the card's link overlay; "page" is larger. */
  size?: "card" | "page";
}

export function AddToCart({ productId, productName, inStock, size = "card" }: Props) {
  const { user, loading } = useAuth();
  const { quantityOf, setQuantity, busy } = useCart();
  const router = useRouter();
  const pathname = usePathname();
  const [error, setError] = useState<string | null>(null);

  const qty = quantityOf(productId);
  const pending = busy.has(productId);
  const base = size === "page" ? "px-6 py-3 text-base" : "px-3 py-1.5 text-sm";
  const wrap = "relative z-10"; // sits above the card's whole-card link overlay

  if (!inStock) {
    return <p className={`${wrap} text-sm font-medium text-zinc-500`}>Out of stock</p>;
  }

  async function change(next: number) {
    setError(null);
    const { error: err } = await setQuantity(productId, next);
    if (err) setError(err);
  }

  function onAdd() {
    if (loading) return;
    if (!user) return router.push(`/login?next=${encodeURIComponent(pathname)}`);
    void change(1);
  }

  const stepBtn =
    "flex h-8 w-8 items-center justify-center rounded-lg bg-white text-lg font-bold text-emerald-700 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:opacity-50";

  return (
    <div className={wrap}>
      {qty === 0 ? (
        <button
          type="button"
          onClick={onAdd}
          disabled={pending}
          aria-label={`Add ${productName} to cart`}
          className={`rounded-xl border border-emerald-600 font-semibold text-emerald-700 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-60 ${base}`}
        >
          {pending ? "Adding…" : "Add"}
        </button>
      ) : (
        <div role="group" aria-label={`${productName} quantity`} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 p-1 text-white">
          <button type="button" className={stepBtn} disabled={pending} onClick={() => change(qty - 1)} aria-label={`Decrease quantity of ${productName}`}>
            <span aria-hidden="true">−</span>
          </button>
          <span aria-live="polite" className="min-w-6 text-center font-semibold">{qty}</span>
          <button type="button" className={stepBtn} disabled={pending || qty >= MAX_QTY} onClick={() => change(qty + 1)} aria-label={`Increase quantity of ${productName}`}>
            <span aria-hidden="true">+</span>
          </button>
        </div>
      )}
      {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
