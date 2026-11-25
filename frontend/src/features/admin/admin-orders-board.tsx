"use client";

import Link from "next/link";
import { useState } from "react";
import { EmptyState, ErrorNotice } from "@/components/feedback";
import { useApiData } from "@/features/auth/use-api";
import { StatusBadge } from "@/features/orders/orders-list";
import { formatOrderDate, shortOrderId, STATUS_LABEL } from "@/features/orders/status";
import { formatPaise } from "@/lib/money";
import type { AdminOrder, OrderStatus } from "@/types/api";

const FILTERS: (OrderStatus | "")[] = ["", "pending", "confirmed", "packed", "out_for_delivery", "delivered", "cancelled"];

export function AdminOrdersBoard() {
  const [status, setStatus] = useState<OrderStatus | "">("pending");
  const [page, setPage] = useState(1);
  const path = `/admin/orders?${status ? `status=${status}&` : ""}page=${page}&pageSize=20`;
  const { data, meta, error, loading } = useApiData<AdminOrder[]>(path);
  const pages = meta ? Math.max(1, Math.ceil(meta.total / meta.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold">Orders</h2>
        <label className="ml-auto flex items-center gap-2 text-sm">
          Status
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value as OrderStatus | ""); setPage(1); }}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5"
          >
            {FILTERS.map((s) => <option key={s} value={s}>{s ? STATUS_LABEL[s] : "All"}</option>)}
          </select>
        </label>
      </div>

      {loading && <p role="status" className="text-zinc-500">Loading orders…</p>}
      {error && <ErrorNotice message={error} />}
      {data && data.length === 0 && <EmptyState title="No orders here" hint="Try another status filter." />}
      {data && data.length > 0 && (
        <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white">
          {data.map((o) => (
            <li key={o.id}>
              <Link href={`/admin/orders/${o.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-600">
                <div>
                  <p className="font-semibold">Order #{shortOrderId(o.id)}</p>
                  <p className="text-sm text-zinc-500">{formatOrderDate(o.created_at)} · customer {o.user_id.slice(0, 8)}</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-semibold">{formatPaise(o.total_paise)}</span>
                  <StatusBadge status={o.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {meta && pages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium disabled:opacity-40">Previous</button>
          <span className="text-sm text-zinc-600">Page {page} of {pages} · {meta.total} orders</span>
          <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium disabled:opacity-40">Next</button>
        </nav>
      )}
    </div>
  );
}
