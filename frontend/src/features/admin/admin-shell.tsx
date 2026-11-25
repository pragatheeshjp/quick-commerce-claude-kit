"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ErrorNotice } from "@/components/feedback";
import { RequireAuth } from "@/features/auth/require-auth";
import { useApiData } from "@/features/auth/use-api";
import type { Me } from "@/types/api";

function Gate({ children }: { children: ReactNode }) {
  const { data, error, loading } = useApiData<Me>("/me");
  if (loading) return <p role="status" className="py-8 text-zinc-500">Checking access…</p>;
  if (error) return <ErrorNotice message={error} />;
  if (data?.role !== "admin") {
    return (
      <div role="alert" className="mx-auto max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
        <h1 className="text-xl font-bold text-amber-900">No access</h1>
        <p className="mt-2 text-amber-900">This area is for Swiftcart administrators. If you need access, ask an existing admin.</p>
        <Link href="/" className="mt-4 inline-block font-medium underline">Back to the shop</Link>
      </div>
    );
  }
  return <>{children}</>;
}

/**
 * UX gate only: it hides admin screens from non-admins. The API enforces the admin role on every
 * /admin request, so a bypassed gate still gets 403s and no data.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <Gate>{children}</Gate>
    </RequireAuth>
  );
}

const LINKS = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/admins", label: "Admins" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin sections" className="mb-6 flex gap-1 overflow-x-auto border-b border-zinc-200 pb-2">
      {LINKS.map((l) => {
        const active = l.exact ? pathname === l.href : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-emerald-600 ${active ? "bg-emerald-700 text-white" : "text-zinc-700 hover:bg-emerald-50"}`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
