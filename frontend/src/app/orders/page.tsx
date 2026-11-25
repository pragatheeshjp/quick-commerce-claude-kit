import type { Metadata } from "next";
import { RequireAuth } from "@/features/auth/require-auth";
import { OrdersList } from "@/features/orders/orders-list";

export const metadata: Metadata = { title: "Your orders" };

export default function OrdersPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold">Your orders</h1>
      <RequireAuth>
        <OrdersList />
      </RequireAuth>
    </div>
  );
}
