import type { Metadata } from "next";
import { CartView } from "@/features/cart/cart-view";
import { RequireAuth } from "@/features/auth/require-auth";

export const metadata: Metadata = { title: "Your cart" };

export default function CartPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Your cart</h1>
      <RequireAuth>
        <CartView />
      </RequireAuth>
    </div>
  );
}
