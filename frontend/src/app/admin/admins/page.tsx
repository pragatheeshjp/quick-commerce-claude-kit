import type { Metadata } from "next";
import { AdminAdmins } from "@/features/admin/admin-admins";

export const metadata: Metadata = { title: "Admins" };

// Admin pages sit behind a client-side session/role gate (see AdminLayout), so they are intentionally not part of the
// static shell. Opt out of dev-time instant-navigation validation (warning level only; build unaffected).
export const instant = false;

export default function AdminAdminsPage() {
  return <AdminAdmins />;
}

