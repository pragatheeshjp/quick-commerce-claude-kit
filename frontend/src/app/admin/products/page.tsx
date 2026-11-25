import type { Metadata } from "next";
import { AdminProductsList } from "@/features/admin/admin-products-list";

export const metadata: Metadata = { title: "Products" };

// Admin pages sit behind a client-side session/role gate (see AdminLayout), so they are intentionally not part of the
// static shell. Opt out of dev-time instant-navigation validation (warning level only; build unaffected).
export const instant = false;

export default function AdminProductsPage() {
  return <AdminProductsList />;
}

