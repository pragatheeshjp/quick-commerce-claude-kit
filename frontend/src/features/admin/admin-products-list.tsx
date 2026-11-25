"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { EmptyState, ErrorNotice } from "@/components/feedback";
import { useApiData, useAuthedApi } from "@/features/auth/use-api";
import { describeApiError } from "@/lib/errors";
import { formatPaise } from "@/lib/money";
import type { AdminProduct } from "@/types/api";

export function AdminProductsList() {
  const call = useAuthedApi();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState<string | null>(null);
  const path = `/admin/products?${query ? `q=${encodeURIComponent(query)}&` : ""}page=${page}&pageSize=20`;
  const { data, meta, error, loading, reload } = useApiData<AdminProduct[]>(path);
  const pages = meta ? Math.max(1, Math.ceil(meta.total / meta.pageSize)) : 1;

  function onSearch(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    setQuery(q.trim().replace(/[^\p{L}\p{M}\p{N} '&.-]/gu, ""));
  }

  async function toggleActive(p: AdminProduct) {
    setActionError(null);
    try {
      await call(`/admin/products/${p.id}`, { method: "PATCH", body: { is_active: !p.is_active } });
    } catch (err) {
      setActionError(describeApiError(err));
    }
    reload();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold">Products</h2>
        <Link href="/admin/products/new" className="ml-auto rounded-xl bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800">+ New product</Link>
      </div>
      <form onSubmit={onSearch} role="search" className="flex gap-2">
        <label htmlFor="admin-q" className="sr-only">Search products</label>
        <input id="admin-q" value={q} onChange={(e) => setQ(e.target.value)} maxLength={60} placeholder="Search by name or brand" className="flex-1 rounded-xl border border-zinc-300 px-3.5 py-2 focus:outline-2 focus:outline-emerald-600" />
        <button type="submit" className="rounded-xl border border-zinc-300 bg-white px-4 font-semibold hover:bg-zinc-50">Search</button>
      </form>

      {actionError && <p role="alert" className="text-sm text-red-700">{actionError}</p>}
      {loading && <p role="status" className="text-zinc-500">Loading products…</p>}
      {error && <ErrorNotice message={error} />}
      {data && data.length === 0 && <EmptyState title="No products found" hint={query ? "Try a different search." : "Create your first product."} />}
      {data && data.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Products</caption>
            <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-600">
              <tr><th scope="col" className="px-4 py-2">Product</th><th scope="col" className="px-4 py-2">Price</th><th scope="col" className="px-4 py-2">Stock</th><th scope="col" className="px-4 py-2">Status</th><th scope="col" className="px-4 py-2"><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {data.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2"><p className="font-medium">{p.name}</p><p className="text-xs text-zinc-500">{p.sku} · {p.unit_label}</p></td>
                  <td className="px-4 py-2">{formatPaise(p.price_paise)}</td>
                  <td className={`px-4 py-2 ${p.stock_quantity === 0 ? "font-semibold text-red-700" : ""}`}>{p.stock_quantity}</td>
                  <td className="px-4 py-2">{p.is_active ? <span className="text-emerald-700">Active</span> : <span className="text-zinc-500">Inactive</span>}</td>
                  <td className="space-x-3 px-4 py-2 text-right">
                    <Link href={`/admin/products/${p.id}`} className="text-emerald-700 underline">Edit{" "}<span className="sr-only">{p.name}</span></Link>
                    <button type="button" onClick={() => toggleActive(p)} className="text-zinc-600 underline hover:text-zinc-900">
                      {p.is_active ? "Deactivate" : "Activate"}{" "}<span className="sr-only">{p.name}</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {meta && pages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium disabled:opacity-40">Previous</button>
          <span className="text-sm text-zinc-600">Page {page} of {pages} · {meta.total} products</span>
          <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium disabled:opacity-40">Next</button>
        </nav>
      )}
    </div>
  );
}

