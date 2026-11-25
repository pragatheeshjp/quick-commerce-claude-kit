"use client";

import Link from "next/link";
import { useState } from "react";
import { ErrorNotice } from "@/components/feedback";
import { useApiData, useAuthedApi } from "@/features/auth/use-api";
import { describeApiError } from "@/lib/errors";
import { formatPaise } from "@/lib/money";
import type { Order } from "@/types/api";
import { StatusBadge } from "./orders-list";
import { canCustomerCancel, formatOrderDate, shortOrderId, STATUS_LABEL, TIMELINE } from "./status";

function Timeline({ status }: { status: Order["status"] }) {
  const index = TIMELINE.indexOf(status);
  return (
    <ol aria-label="Order progress" className="grid grid-cols-5 gap-1 text-center text-xs">
      {TIMELINE.map((s, i) => (
        <li key={s} aria-current={i === index ? "step" : undefined} className={i <= index ? "font-semibold text-emerald-800" : "text-zinc-600"}>
          <div className={`mx-auto mb-1 h-2 w-full rounded-full ${i <= index ? "bg-emerald-700" : "bg-zinc-200"}`} />
          {STATUS_LABEL[s]}
        </li>
      ))}
    </ol>
  );
}

export function OrderDetail({ id }: { id: string }) {
  const call = useAuthedApi();
  const { data: order, error, loading, reload } = useApiData<Order>(`/orders/${encodeURIComponent(id)}`);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  async function cancel() {
    setBusy(true);
    setCancelError(null);
    try {
      await call(`/orders/${id}/cancel`, { method: "POST" });
      setConfirming(false);
      reload();
    } catch (err) {
      setCancelError(describeApiError(err));
      reload(); // the status may have moved on (e.g. packed); show the truth
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p role="status" className="text-zinc-500">Loading your order…</p>;
  if (error || !order) {
    return (
      <div className="space-y-3">
        <ErrorNotice message={error ?? "We could not find this order."} />
        <Link href="/orders" className="text-emerald-700 underline">Back to your orders</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Order #{shortOrderId(order.id)}</h1>
          <p className="text-sm text-zinc-500">Placed {formatOrderDate(order.created_at)}</p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {order.status === "cancelled" ? (
        <p className="rounded-xl bg-red-50 p-4 text-red-900">This order was cancelled.</p>
      ) : (
        <Timeline status={order.status} />
      )}
      {order.status === "pending" && (
        <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">We have received your order. Our team will confirm it shortly.</p>
      )}

      <section aria-labelledby="items-h">
        <h2 id="items-h" className="mb-2 font-bold">Items</h2>
        <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white px-4">
          {(order.items ?? []).map((i) => (
            <li key={`${i.sku}`} className="flex justify-between gap-4 py-3 text-sm">
              <span>{i.name} <span className="text-zinc-500">× {i.quantity} @ {formatPaise(i.unit_price_paise)}</span></span>
              <span className="font-medium">{formatPaise(i.line_total_paise)}</span>
            </li>
          ))}
        </ul>
      </section>

      <dl className="space-y-1 rounded-2xl border border-zinc-200 bg-white p-4 text-sm">
        <div className="flex justify-between"><dt className="text-zinc-600">Items subtotal</dt><dd>{formatPaise(order.subtotal_paise)}</dd></div>
        {order.discount_paise > 0 && <div className="flex justify-between text-emerald-800"><dt>Coupon discount</dt><dd>-{formatPaise(order.discount_paise)}</dd></div>}
        <div className="flex justify-between"><dt className="text-zinc-600">Delivery fee</dt><dd>{order.delivery_fee_paise === 0 ? "Free" : formatPaise(order.delivery_fee_paise)}</dd></div>
        <div className="flex justify-between border-t border-zinc-200 pt-2 text-base font-bold"><dt>Total</dt><dd>{formatPaise(order.total_paise)}</dd></div>
      </dl>

      <section aria-labelledby="addr-h">
        <h2 id="addr-h" className="mb-1 font-bold">Delivering to</h2>
        <p className="text-sm text-zinc-700">
          {[order.delivery_address.label, order.delivery_address.line1, order.delivery_address.line2, order.delivery_address.landmark,
            `${order.delivery_address.city}, ${order.delivery_address.state} ${order.delivery_address.pincode}`].filter(Boolean).join(", ")}
        </p>
      </section>

      {canCustomerCancel(order.status) && (
        <section aria-label="Cancel order">
          {cancelError && <p role="alert" className="mb-2 text-sm text-red-700">{cancelError}</p>}
          {confirming ? (
            <div role="alertdialog" aria-label="Confirm cancellation" className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-900">Cancel this order? This cannot be undone.</p>
              <button type="button" disabled={busy} onClick={cancel} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60">
                {busy ? "Cancelling…" : "Yes, cancel order"}
              </button>
              <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold">Keep order</button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className="rounded-xl border border-red-300 px-4 py-2 font-semibold text-red-800 hover:bg-red-50">Cancel order</button>
          )}
        </section>
      )}

      <Link href="/orders" className="inline-block text-sm font-medium text-emerald-700 underline">← All orders</Link>
    </div>
  );
}
