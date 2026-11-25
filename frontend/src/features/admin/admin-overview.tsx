"use client";

import Link from "next/link";
import { useApiData } from "@/features/auth/use-api";
import type { AdminOrder, AdminProduct } from "@/types/api";

function Card({ href, title, value, hint }: { href: string; title: string; value: string; hint: string }) {
  return (
    <Link href={href} className="rounded-2xl border border-zinc-200 bg-white p-5 hover:border-emerald-500 focus-visible:outline-2 focus-visible:outline-emerald-600">
      <p className="text-sm text-zinc-600">{title}</p>
      <p className="mt-1 text-3xl font-extrabold">{value}</p>
      <p className="mt-1 text-sm text-zinc-500">{hint}</p>
    </Link>
  );
}

export function AdminOverview() {
  const pending = useApiData<AdminOrder[]>("/admin/orders?status=pending&page=1&pageSize=1");
  const products = useApiData<AdminProduct[]>("/admin/products?page=1&pageSize=1");
  const show = (d: { meta?: { total: number }; error?: string; loading: boolean }) => (d.loading ? "…" : d.error ? "–" : String(d.meta?.total ?? 0));
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Overview</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card href="/admin/orders" title="Orders waiting for confirmation" value={show(pending)} hint="Review and confirm" />
        <Card href="/admin/products" title="Products" value={show(products)} hint="Manage catalog and stock" />
        <Card href="/admin/categories" title="Categories" value="Manage" hint="Organise the catalog" />
      </div>
    </div>
  );
}
