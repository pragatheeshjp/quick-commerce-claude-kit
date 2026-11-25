import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminNav, RequireAdmin } from "@/features/admin/admin-shell";

export const metadata: Metadata = { title: { default: "Admin", template: "%s | Admin | Swiftcart" }, robots: { index: false } };

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <h1 className="sr-only">Admin</h1>
      <RequireAdmin>
        <AdminNav />
        {children}
      </RequireAdmin>
    </div>
  );
}

