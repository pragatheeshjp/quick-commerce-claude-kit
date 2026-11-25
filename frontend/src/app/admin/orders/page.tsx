import type { Metadata } from "next";
import { AdminOrdersBoard } from "@/features/admin/admin-orders-board";

export const metadata: Metadata = { title: "Orders" };

// Admin pages sit behind a client-side session/role gate (see AdminLayout), so they are intentionally not part of the
// static shell. Opt out of dev-time instant-navigation validation (warning level only; build unaffected).
export const instant = false;

export default function AdminOrdersPage() {
  return <AdminOrdersBoard />;
}

