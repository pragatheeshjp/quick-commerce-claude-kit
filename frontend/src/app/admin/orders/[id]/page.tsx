import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminOrderDetail } from "@/features/admin/admin-order-detail";

export const metadata: Metadata = { title: "Order" };

// Admin pages sit behind a client-side session/role gate (see AdminLayout), so they are intentionally not part of the
// static shell. Opt out of dev-time instant-navigation validation (warning level only; build unaffected).
export const instant = false;

async function Detail({ params }: { params: PageProps<"/admin/orders/[id]">["params"] }) {
  const { id } = await params;
  return <AdminOrderDetail id={id} />;
}

export default function AdminOrderPage(props: PageProps<"/admin/orders/[id]">) {
  return (
    <Suspense fallback={<p role="status" className="text-zinc-500">Loading…</p>}>
      <Detail params={props.params} />
    </Suspense>
  );
}

