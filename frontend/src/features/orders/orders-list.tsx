"use client";

import Link from "next/link";
import { useState } from "react";
import { EmptyState, ErrorNotice } from "@/components/feedback";
import { useApiData } from "@/features/auth/use-api";
import { formatPaise } from "@/lib/money";
import type { Order } from "@/types/api";
import { formatOrderDate, shortOrderId, STATUS_LABEL } from "./status";

export function StatusBadge({ status }: { status: Order["status"] }) {
  const tone =
    status === "cancelled" ? "bg-red-100 text-red-800" : status === "delivered" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900";
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>{STATUS_LABEL[status]}</span>;
}

export function OrdersList() {
  const [page, setPage] = useState(1);
  const { data, meta, error, loading } = useApiData<Order[]>(`/orders?page=${page}&pageSize=10`);

  if (loading) return <p role="status" className="text-zinc-500">Loading your orders…</p>;
  if (error) return <ErrorNotice message={error} />;
  if (!data || data.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyState title="No orders yet" hint="When you place an order, it will appear here." />
        <Link href="/" className="inline-block rounded-xl bg-emerald-700 px-5 py-2.5 font-semibold text-white hover:bg-emerald-800">Start shopping</Link>
      </div>
    );
  }

  const pages = meta ? Math.max(1, Math.ceil(meta.total / meta.pageSize)) : 1;
  return (
    <div>
      <ul className="space-y-3">
        {data.map((o) => (
          <li key={o.id}>
            <Link href={`/orders/${o.id}`} className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-white p-4 hover:border-emerald-500 focus-visible:outline-2 focus-visible:outline-emerald-600">
              <div>
                <p className="font-semibold">Order #{shortOrderId(o.id)}</p>
                <p className="text-sm text-zinc-500">{formatOrderDate(o.created_at)}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold">{formatPaise(o.total_paise)}</p>
                <StatusBadge status={o.status} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {pages > 1 && (
        <nav aria-label="Pagination" className="mt-6 flex items-center justify-between">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium disabled:opacity-40">Previous</button>
          <span className="text-sm text-zinc-600">Page {page} of {pages}</span>
          <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium disabled:opacity-40">Next</button>
        </nav>
      )}
    </div>
  );
}
