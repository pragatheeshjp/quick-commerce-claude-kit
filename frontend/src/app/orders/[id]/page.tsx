import type { Metadata } from "next";
import { Suspense } from "react";
import { RequireAuth } from "@/features/auth/require-auth";
import { OrderDetail } from "@/features/orders/order-detail";

export const metadata: Metadata = { title: "Order details" };

async function Detail({ params }: { params: PageProps<"/orders/[id]">["params"] }) {
  const { id } = await params;
  return <OrderDetail id={id} />;
}

export default function OrderPage(props: PageProps<"/orders/[id]">) {
  return (
    <div className="mx-auto max-w-2xl">
      <RequireAuth>
        <Suspense fallback={<p role="status" className="text-zinc-500">Loading…</p>}>
          <Detail params={props.params} />
        </Suspense>
      </RequireAuth>
    </div>
  );
}
