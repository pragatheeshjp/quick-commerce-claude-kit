import type { Metadata } from "next";
import { RequireAuth } from "@/features/auth/require-auth";
import { CheckoutView } from "@/features/checkout/checkout-view";

export const metadata: Metadata = { title: "Checkout" };

export default function CheckoutPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Checkout</h1>
      <RequireAuth>
        <CheckoutView />
      </RequireAuth>
    </div>
  );
}
