"use client";

import Link from "next/link";
import { useState } from "react";
import { ErrorNotice } from "@/components/feedback";
import { useApiData, useAuthedApi } from "@/features/auth/use-api";
import { StatusBadge } from "@/features/orders/orders-list";
import { formatOrderDate, shortOrderId, STATUS_LABEL } from "@/features/orders/status";
import { describeApiError } from "@/lib/errors";
import { formatPaise } from "@/lib/money";
import type { AdminOrder, OrderStatus } from "@/types/api";
import { NEXT_STATUSES } from "./order-transitions";

export function AdminOrderDetail({ id }: { id: string }) {
  const call = useAuthedApi();
  const { data: order, error, loading, reload } = useApiData<AdminOrder>(`/admin/orders/${encodeURIComponent(id)}`);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function setStatus(status: OrderStatus) {
    setBusy(true);
    setActionError(null);
    try {
      await call(`/admin/orders/${id}/status`, { method: "PATCH", body: { status } });
      setConfirmCancel(false);
    } catch (err) {
      setActionError(describeApiError(err));
    } finally {
      setBusy(false);
      reload(); // always show the real status, even after a refused change
    }
  }

  if (loading) return <p role="status" className="text-zinc-500">Loading order…</p>;
  if (error || !order) return <ErrorNotice message={error ?? "Order not found."} />;

  const next = NEXT_STATUSES[order.status];
  const forward = next.filter((s) => s !== "cancelled");
  const canCancel = next.includes("cancelled");
  const a = order.delivery_address;

  return (
    <div className="space-y-6">
      <Link href="/admin/orders" className="text-sm font-medium text-emerald-700 underline">← All orders</Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">Order #{shortOrderId(order.id)}</h2>
          <p className="text-sm text-zinc-500">Placed {formatOrderDate(order.created_at)} · customer {order.user_id}</p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <section aria-labelledby="act-h" className="rounded-2xl border border-zinc-200 bg-white p-4">
        <h3 id="act-h" className="mb-3 font-bold">Update status</h3>
        {actionError && <p role="alert" className="mb-3 text-sm text-red-700">{actionError}</p>}
        {next.length === 0 ? (
          <p className="text-sm text-zinc-600">This order is {STATUS_LABEL[order.status].toLowerCase()}; no further changes are possible.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {forward.map((s) => (
              <button key={s} type="button" disabled={busy} onClick={() => setStatus(s)} className="rounded-xl bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
                Mark as {STATUS_LABEL[s].toLowerCase()}
              </button>
            ))}
            {canCancel && !confirmCancel && (
              <button type="button" disabled={busy} onClick={() => setConfirmCancel(true)} className="rounded-xl border border-red-300 px-4 py-2 font-semibold text-red-800 hover:bg-red-50">Cancel order</button>
            )}
          </div>
        )}
        {confirmCancel && (
          <div role="alertdialog" aria-label="Confirm cancellation" className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-900">Cancel this order? Stock is restored and any coupon is released.</p>
            <button type="button" disabled={busy} onClick={() => setStatus("cancelled")} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60">Yes, cancel order</button>
            <button type="button" disabled={busy} onClick={() => setConfirmCancel(false)} className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold">Keep order</button>
          </div>
        )}
      </section>

      <section aria-labelledby="it-h">
        <h3 id="it-h" className="mb-2 font-bold">Items</h3>
        <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white px-4">
          {(order.items ?? []).map((i) => (
            <li key={i.sku} className="flex justify-between gap-4 py-3 text-sm">
              <span>{i.name} <span className="text-zinc-500">({i.sku}) × {i.quantity} @ {formatPaise(i.unit_price_paise)}</span></span>
              <span className="font-medium">{formatPaise(i.line_total_paise)}</span>
            </li>
          ))}
        </ul>
      </section>

      <dl className="space-y-1 rounded-2xl border border-zinc-200 bg-white p-4 text-sm">
        <div className="flex justify-between"><dt className="text-zinc-600">Items subtotal</dt><dd>{formatPaise(order.subtotal_paise)}</dd></div>
        {order.discount_paise > 0 && <div className="flex justify-between"><dt className="text-zinc-600">Discount</dt><dd>-{formatPaise(order.discount_paise)}</dd></div>}
        <div className="flex justify-between"><dt className="text-zinc-600">Delivery fee</dt><dd>{formatPaise(order.delivery_fee_paise)}</dd></div>
        <div className="flex justify-between border-t border-zinc-200 pt-2 text-base font-bold"><dt>Total</dt><dd>{formatPaise(order.total_paise)}</dd></div>
      </dl>

      <section aria-labelledby="ad-h">
        <h3 id="ad-h" className="mb-1 font-bold">Delivery address</h3>
        <p className="text-sm text-zinc-700">{[a.label, a.line1, a.line2, a.landmark, `${a.city}, ${a.state} ${a.pincode}`].filter(Boolean).join(", ")}</p>
      </section>
    </div>
  );
}
