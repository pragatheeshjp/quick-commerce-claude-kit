"use client";

import Link from "next/link";
import { useAuth } from "@/features/auth/auth-provider";
import { useCart } from "@/features/cart/cart-provider";
import { LocationPicker } from "@/features/location/location-picker";
import { ThemeToggle } from "@/components/theme-toggle";

function CartLink() {
  const { itemCount } = useCart();
  return (
    <Link
      href="/cart"
      className="relative rounded-lg px-3 py-1.5 text-sm font-semibold text-zinc-900 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-600"
    >
      Cart
      {itemCount > 0 && (
        <>
          {" "}
          <span className="ml-1.5 rounded-full bg-emerald-700 px-1.5 py-0.5 text-xs text-white">
            {itemCount}
            {" "}
            <span className="sr-only">items in cart</span>
          </span>
        </>
      )}
    </Link>
  );
}

function AccountLink() {
  const { user, loading } = useAuth();
  const base = "rounded-lg px-3 py-1.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-emerald-600";
  if (loading) return <span className="h-8 w-16" aria-hidden="true" />;
  return user ? (
    <Link href="/account" className={`${base} text-zinc-900 hover:bg-emerald-50`}>Account</Link>
  ) : (
    <Link href="/login" className={`${base} bg-emerald-700 text-white hover:bg-emerald-800`}>Log in</Link>
  );
}

export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" className="text-xl font-extrabold tracking-tight text-emerald-700 focus-visible:outline-2 focus-visible:outline-emerald-600">
          Swiftcart
        </Link>
        <LocationPicker />
        <form action="/search" role="search" className="order-last w-full sm:order-none sm:w-auto sm:flex-1">
          <label htmlFor="site-search" className="sr-only">Search products</label>
          <input
            id="site-search"
            name="q"
            type="search"
            maxLength={60}
            placeholder="Search milk, bananas, snacks…"
            className="w-full rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-2 text-sm focus:bg-white focus:outline-2 focus:outline-emerald-600"
          />
        </form>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <CartLink />
          <AccountLink />
        </div>
      </div>
    </header>
  );
}

